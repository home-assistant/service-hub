import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Octokit } from "@octokit/rest";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { isBotCommand } from "../../../src/github/engine/command-context.js";
import { dispatch, dispatchCommand } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import {
  commandContextFromWebhook,
  contextFromWebhook,
  type WebhookEventPayload,
} from "../../../src/github/engine/model/from-webhook.js";
import type { RuleContext } from "../../../src/github/engine/rule-context.js";
import { config } from "../../../src/github/manifests/index.js";
import { createMockGitHub, type MockGitHub } from "../helpers/mock-context.js";

const BOT_SLUG = "ha-bot";
const COMMAND_SLUG = "ha-bot";

export interface FixtureFile {
  filename: string;
  status?: string;
  additions?: number;
}

/**
 * Sidecar `<fixture>.state.json`: the world outside the payload — everything
 * the rules would otherwise read from the GitHub API or remote endpoints.
 * All fields optional; a fixture without a sidecar runs against empty state.
 */
export interface FixtureState {
  /** The PR's changed files (pulls.listFiles). */
  files?: FixtureFile[];
  /** mergeable_state served by pulls.get hydration; defaults to "clean". */
  mergeableState?: string;
  /** Raw CODEOWNERS content served for the repo. */
  codeowners?: string;
  /** URL substring → JSON body served by the fetch mock; other URLs 404. */
  remote?: Record<string, unknown>;
  /** Extra fields served by pulls.get hydration (draft, node_id, …). */
  pullRequest?: Record<string, unknown>;
}

export interface Fixture {
  /** Filename without `.json`; `<event>.<action>[.variant]`. */
  name: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  state: FixtureState;
}

const KNOWN_EVENT_TYPES = new Set<string>(Object.values(EventType));

/**
 * Load every captured webhook payload in a fixture directory. The delivery's
 * event type isn't part of the payload GitHub sends (it travels in the
 * `x-github-event` header), so it's encoded in the filename instead:
 * `pull_request.opened.new-integration.json` replays a `pull_request.opened`
 * delivery. A matching `<name>.state.json` sidecar stubs the world state.
 */
export function loadFixtures(dir: string): Fixture[] {
  return readdirSync(dir)
    .filter(
      (file) =>
        file.endsWith(".json") && !file.endsWith(".state.json") && !file.endsWith(".body.json"),
    )
    .sort()
    .map((file) => {
      const name = file.slice(0, -".json".length);
      const [event, action] = name.split(".");
      const eventType = `${event}.${action}` as EventType;
      if (!KNOWN_EVENT_TYPES.has(eventType)) {
        throw new Error(
          `Fixture "${file}" does not encode a known event type — name it <event>.<action>[.variant].json`,
        );
      }
      const payload = JSON.parse(readFileSync(join(dir, file), "utf8"));
      const sidecar = join(dir, `${name}.state.json`);
      const state = existsSync(sidecar) ? JSON.parse(readFileSync(sidecar, "utf8")) : {};
      return { name, eventType, payload, state };
    });
}

/**
 * The pulls.get response backing lazy hydration: the payload's own
 * pull_request when it carries one, minimal PR-shaped defaults for comment
 * payloads (which only carry the issue view), plus sidecar overrides.
 */
function hydrationPullRequest(fixture: Fixture): Record<string, unknown> {
  const payload = fixture.payload as {
    pull_request?: Record<string, unknown>;
    issue?: Record<string, unknown>;
  };
  const issue = payload.issue ?? {};
  const seed = payload.pull_request ?? {
    number: (issue as { number?: number }).number ?? 1,
    node_id: "PR_1",
    head: { sha: "abc123" },
    base: { ref: "dev" },
    labels: (issue as { labels?: unknown }).labels ?? [],
    body: (issue as { body?: unknown }).body ?? "",
    user: (issue as { user?: unknown }).user ?? { login: "contributor" },
    author_association: "CONTRIBUTOR",
    assignees: [],
    draft: false,
    merged: false,
    merged_at: null,
    state: "open",
  };
  return {
    ...seed,
    ...fixture.state.pullRequest,
    mergeable_state: fixture.state.mergeableState ?? "clean",
  };
}

function routeFetch(remote: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [pattern, body] of Object.entries(remote)) {
      if (url.includes(pattern)) {
        return { ok: true, status: 200, json: async () => body } as Response;
      }
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }) as typeof fetch;
}

function seedFiles(context: RuleContext, files: FixtureFile[]): void {
  const target = context.target as unknown as { caches: { files?: Promise<unknown> } };
  target.caches.files = Promise.resolve(
    files.map((f) => ({
      filename: f.filename,
      status: f.status ?? "modified",
      additions: f.additions ?? 10,
      deletions: 0,
    })),
  );
}

/** One GitHub write the pipeline performed, in call order. */
export interface RecordedCall {
  call: string;
  params: unknown;
}

/**
 * Mutating endpoints — the bot's outputs. Read calls (hydration, comment
 * listing, status sweeps) stay out of the recording.
 */
const WRITE_CALLS = new Set([
  "issues.addLabels",
  "issues.removeLabel",
  "issues.addAssignees",
  "issues.removeAssignees",
  "issues.update",
  "issues.createComment",
  "issues.updateComment",
  "pulls.update",
  "pulls.updateBranch",
  "pulls.requestReviewers",
  "pulls.createReview",
  "pulls.dismissReview",
  "repos.createCommitStatus",
  "reactions.createForIssueComment",
  "graphql",
]);

/**
 * A mock Octokit that records every write in call order and keeps a stateful
 * comment store, so the dashboard upsert behaves like the real API: the
 * placeholder posted first is found again and updated, not re-created.
 */
function createRecordingGitHub(): {
  github: MockGitHub;
  octokit: Octokit;
  recorded: RecordedCall[];
} {
  const github = createMockGitHub();
  const recorded: RecordedCall[] = [];

  const comments: { id: number; body: string; html_url: string }[] = [];
  github.issues.createComment.mockImplementation(
    async (params: { owner: string; repo: string; issue_number: number; body: string }) => {
      const id = 1000 + comments.length;
      const comment = {
        id,
        body: params.body,
        html_url: `https://github.com/${params.owner}/${params.repo}/issues/${params.issue_number}#issuecomment-${id}`,
      };
      comments.push(comment);
      return { data: comment };
    },
  );
  github.issues.updateComment.mockImplementation(
    async (params: { comment_id: number; body: string }) => {
      const comment = comments.find((c) => c.id === params.comment_id);
      if (comment) comment.body = params.body;
      return { data: { id: params.comment_id, html_url: comment?.html_url } };
    },
  );
  github.issues.listComments.mockImplementation(async () => ({ data: comments }));

  const record =
    (path: string, fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      recorded.push({
        call: path,
        params: path === "graphql" ? { query: args[0], variables: args[1] } : args[0],
      });
      return fn(...args);
    };

  const octokit = { ...github } as unknown as Record<string, unknown>;
  for (const [ns, members] of Object.entries(github)) {
    if (typeof members === "function") continue;
    const nsCopy: Record<string, unknown> = { ...members };
    for (const [name, fn] of Object.entries(members)) {
      const path = `${ns}.${name}`;
      if (WRITE_CALLS.has(path)) nsCopy[name] = record(path, fn);
    }
    octokit[ns] = nsCopy;
  }
  octokit.graphql = record("graphql", github.graphql);

  return { github, octokit: octokit as unknown as Octokit, recorded };
}

/**
 * Replay one captured delivery through the real pipeline — the same routing
 * the webhook entrypoint does (command comments go through dispatchCommand,
 * everything else through rule dispatch), against the real manifest registry
 * resolved from payload.repository. Runs effect application for real against
 * the recording mock and returns the GitHub writes in call order.
 */
export async function runFixture(fixture: Fixture): Promise<RecordedCall[]> {
  const { github, octokit, recorded } = createRecordingGitHub();
  github.pulls.get.mockResolvedValue({ data: hydrationPullRequest(fixture) });
  if (fixture.state.codeowners) {
    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(fixture.state.codeowners) },
      headers: {},
    });
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = routeFetch(fixture.state.remote ?? {});
  try {
    if (fixture.eventType === EventType.ISSUE_COMMENT_CREATED) {
      const body = (fixture.payload as { comment?: { body?: string } }).comment?.body ?? "";
      if (isBotCommand(body, COMMAND_SLUG)) {
        const context = commandContextFromWebhook(
          octokit,
          fixture.payload as unknown as IssueCommentCreatedEvent,
          { botSlug: BOT_SLUG, commandSlug: COMMAND_SLUG, registry: config },
        );
        if (fixture.state.files) seedFiles(context, fixture.state.files);
        await dispatchCommand(context);
        return recorded;
      }
    }

    const context = contextFromWebhook(
      octokit,
      fixture.payload as unknown as WebhookEventPayload,
      fixture.eventType,
      { botSlug: BOT_SLUG },
    );
    if (fixture.state.files) seedFiles(context, fixture.state.files);
    await dispatch(config, context);
    return recorded;
  } finally {
    globalThis.fetch = originalFetch;
  }
}
