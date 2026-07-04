import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Octokit } from "@octokit/rest";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { isBotCommand } from "../../src/engine/command-context.js";
import { dispatch, dispatchCommand } from "../../src/engine/dispatch.js";
import { EventType } from "../../src/engine/event.js";
import {
  commandContextFromWebhook,
  contextFromWebhook,
  type WebhookEventPayload,
} from "../../src/engine/model/from-webhook.js";
import type { RuleContext } from "../../src/engine/rule-context.js";
import type { Effect } from "../../src/engine/types.js";
import { config } from "../../src/manifests/index.js";
import { createMockGitHub } from "../helpers/mock-context.js";

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
    .filter((file) => file.endsWith(".json") && !file.endsWith(".state.json"))
    .sort()
    .map((file) => {
      const name = file.slice(0, -".json".length);
      const [event, action] = name.split(".");
      // Action-less deliveries (push) are keyed by the bare event name, so
      // their fixtures are `<event>[.variant].json`.
      const eventType = (
        KNOWN_EVENT_TYPES.has(`${event}.${action}`) ? `${event}.${action}` : event
      ) as EventType;
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

/**
 * Collapse the raw effect stream to what the bot would actually do, mirroring
 * applyEffects' batching: the label loop re-emits a rule's dashboard sections
 * and comments every round, and only the final occurrence lands on GitHub.
 * Keyed dedupe (last write wins, first-seen order) keeps snapshots about
 * outcomes instead of loop rounds.
 */
function normalizeEffects(effects: Effect[]): Effect[] {
  const byKey = new Map<string, Effect>();
  for (const effect of effects) {
    const key =
      effect.type === "dashboardSection"
        ? `dashboardSection:${effect.section.id}`
        : JSON.stringify(effect);
    byKey.set(key, effect);
  }
  return [...byKey.values()];
}

/**
 * Replay one captured delivery through the real pipeline — the same routing
 * the webhook entrypoint does (command comments go through dispatchCommand,
 * everything else through rule dispatch), against the real manifest registry
 * resolved from payload.repository. Returns the final effects.
 */
export async function runFixture(fixture: Fixture): Promise<Effect[] | undefined> {
  const github = createMockGitHub();
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
          github as unknown as Octokit,
          fixture.payload as unknown as IssueCommentCreatedEvent,
          { botSlug: BOT_SLUG, commandSlug: COMMAND_SLUG, dryRun: true, registry: config },
        );
        if (fixture.state.files) seedFiles(context, fixture.state.files);
        const effects = await dispatchCommand(context);
        return effects && normalizeEffects(effects);
      }
    }

    const context = contextFromWebhook(
      github as unknown as Octokit,
      fixture.payload as unknown as WebhookEventPayload,
      fixture.eventType,
      { botSlug: BOT_SLUG, dryRun: true },
    );
    if (fixture.state.files) seedFiles(context, fixture.state.files);
    return normalizeEffects(await dispatch(config, context));
  } finally {
    globalThis.fetch = originalFetch;
  }
}
