import type { Octokit } from "@octokit/rest";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { dispatch, dispatchCommand } from "../../src/engine/dispatch.js";
import type { EventType } from "../../src/engine/event.js";
import {
  commandContextFromWebhook,
  contextFromWebhook,
  type WebhookEventPayload,
} from "../../src/engine/model/from-webhook.js";
import type { RuleContext } from "../../src/engine/rule-context.js";
import type { Effect } from "../../src/engine/types.js";
import { config } from "../../src/manifests/index.js";
import { createMockGitHub } from "../helpers/mock-context.js";

export interface ScenarioFile {
  filename: string;
  status?: string;
  additions?: number;
}

/**
 * One end-to-end pipeline run against the real manifest config: a webhook
 * event (or a `/ha-bot` command comment) plus the world state it sees —
 * entity fields, changed files, CODEOWNERS, and remote JSON endpoints
 * (integration manifests, analytics). The result is the full effect list
 * after the label loop, ready to snapshot.
 */
export interface Scenario {
  event: EventType;
  /** Set to run the scenario as a command: the comment body to dispatch. */
  comment?: string;
  sender?: { login: string; type: string };
  /** Current labels on the target PR/issue. */
  labels?: string[];
  /** PR payload field overrides (body, base, draft, …). */
  pr?: Record<string, unknown>;
  /** Present (even empty) → the target is an issue, not a PR. */
  issue?: Record<string, unknown>;
  /** The changed label for labeled/unlabeled events. */
  label?: string;
  files?: ScenarioFile[];
  mergeableState?: string;
  /** Raw CODEOWNERS content served for the repo. */
  codeowners?: string;
  /** URL substring → JSON body served by the fetch mock; other URLs 404. */
  remote?: Record<string, unknown>;
}

const REPOSITORY = {
  full_name: "home-assistant/core",
  name: "core",
  owner: { login: "home-assistant" },
};

function buildPullRequest(scenario: Scenario): Record<string, unknown> {
  return {
    number: 1,
    node_id: "PR_1",
    head: { sha: "abc123" },
    base: { ref: "dev" },
    labels: (scenario.labels ?? []).map((name) => ({ name })),
    body: "",
    user: { login: "contributor", type: "User" },
    author_association: "CONTRIBUTOR",
    assignees: [],
    draft: false,
    merged: false,
    merged_at: null,
    state: "open",
    ...scenario.pr,
  };
}

function buildIssue(scenario: Scenario): Record<string, unknown> {
  return {
    number: 1,
    labels: (scenario.labels ?? []).map((name) => ({ name })),
    body: "",
    user: { login: "contributor", type: "User" },
    assignees: [],
    state: "open",
    ...scenario.issue,
  };
}

function buildPayload(scenario: Scenario): Record<string, unknown> {
  const sender = scenario.sender ?? { login: "contributor", type: "User" };
  const label = scenario.label ? { label: { name: scenario.label } } : {};

  if (scenario.comment !== undefined) {
    // Commands arrive as issue_comment payloads; a PR target carries the
    // pull_request cross-link and hydrates PR fields via pulls.get.
    const issue = buildIssue(scenario);
    if (!scenario.issue) {
      issue.pull_request = { url: "https://api.github.com/repos/home-assistant/core/pulls/1" };
    }
    return {
      action: "created",
      sender,
      repository: REPOSITORY,
      issue,
      comment: { id: 42, body: scenario.comment, user: { login: sender.login } },
    };
  }

  if (scenario.issue) {
    return { sender, repository: REPOSITORY, issue: buildIssue(scenario), ...label };
  }
  return { sender, repository: REPOSITORY, pull_request: buildPullRequest(scenario), ...label };
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

function seedFiles(context: RuleContext, files: ScenarioFile[]): void {
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

/** Run one scenario through the real pipeline; returns the final effects. */
export async function runScenario(scenario: Scenario): Promise<Effect[] | undefined> {
  const github = createMockGitHub();
  github.pulls.get.mockResolvedValue({
    data: { ...buildPullRequest(scenario), mergeable_state: scenario.mergeableState ?? "clean" },
  });
  if (scenario.codeowners) {
    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(scenario.codeowners) },
      headers: {},
    });
  }

  const payload = buildPayload(scenario);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = routeFetch(scenario.remote ?? {});
  try {
    if (scenario.comment !== undefined) {
      const context = commandContextFromWebhook(
        github as unknown as Octokit,
        payload as unknown as IssueCommentCreatedEvent,
        { botSlug: "ha-bot", commandSlug: "ha-bot", dryRun: true, registry: config },
      );
      if (scenario.files) seedFiles(context, scenario.files);
      const effects = await dispatchCommand(context);
      return effects && normalizeEffects(effects);
    }

    const context = contextFromWebhook(
      github as unknown as Octokit,
      payload as unknown as WebhookEventPayload,
      scenario.event,
      { botSlug: "ha-bot", dryRun: true },
    );
    if (scenario.files) seedFiles(context, scenario.files);
    return normalizeEffects(await dispatch(config, context));
  } finally {
    globalThis.fetch = originalFetch;
  }
}
