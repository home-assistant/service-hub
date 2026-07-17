import type { Octokit } from "@octokit/rest";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { dispatch, dispatchCommand, matchRules } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import { isBotCommand } from "../../../src/github/engine/model/command-context.js";
import {
  commandContextFromWebhook,
  ruleContextFromWebhook,
  type WebhookEventPayload,
} from "../../../src/github/engine/model/from-webhook.js";
import type { RuleContext } from "../../../src/github/engine/model/rule-context.js";
import type { Effect } from "../../../src/github/engine/types.js";
import { registryConfig } from "../../../src/github/manifests/index.js";
import { createMockGitHub, testEnv } from "../helpers/mock-context.js";
import { loadPRTemplate, renderPRTemplate } from "./pr-template.js";

// ── Scenario shape ───────────────────────────────────────────────────────────

export interface ScenarioFile {
  filename: string;
  status?: string;
  additions?: number;
}

/** The world outside the payload — what rules would read from GitHub/HTTP. */
export interface ScenarioState {
  /** The PR's changed files (pulls.listFiles); none by default. */
  files?: ScenarioFile[];
  /** mergeable_state served by pulls.get hydration; defaults to "clean". */
  mergeableState?: string;
  /** Raw CODEOWNERS content served for the repo. */
  codeowners?: string;
  /** Org member logins (orgs.checkMembershipForUser); nobody by default. */
  members?: string[];
  /** URL substring → JSON body served by the fetch mock; other URLs 404. */
  remote?: Record<string, unknown>;
  /** Extra fields served by pulls.get hydration (draft, node_id, …). */
  pullRequest?: Record<string, unknown>;
}

export interface Scenario {
  eventType: EventType;
  payload: Record<string, unknown>;
  state?: ScenarioState;
}

// ── Payload building blocks ──────────────────────────────────────────────────

const REPOSITORY = {
  full_name: "home-assistant/core",
  name: "core",
  owner: { login: "home-assistant" },
};

const SENDER = { login: "contributor", type: "User" };

/**
 * Checkbox descriptions as they appear in the upstream PR template; rendering
 * fails loudly when a description no longer matches the vendored template.
 */
export const TYPE_OF_CHANGE: Record<string, string> = {
  bugfix: "Bugfix (non-breaking change which fixes an issue)",
  dependency: "Dependency upgrade",
  "new-integration": "New integration (thank you!)",
  "new-feature": "New feature (which adds functionality to an existing integration)",
  deprecation: "Deprecation (breaking change to happen in the future)",
  "breaking-change": "Breaking change (fix/feature causing existing functionality to break)",
  "code-quality": "Code quality improvements to existing code or addition of tests",
};

const PR_TEMPLATE = loadPRTemplate("home-assistant-core");

/** The real PR template, filled the way a contributor would. */
export function prBody(
  opts: { checked?: string[]; text?: string; sections?: Record<string, string> } = {},
): string {
  const check = (opts.checked ?? []).map((key) => {
    const description = TYPE_OF_CHANGE[key];
    if (!description) throw new Error(`unknown type-of-change key "${key}"`);
    return description;
  });
  return renderPRTemplate(PR_TEMPLATE, {
    check,
    sections: {
      "Proposed change": opts.text ?? "Debounce brightness updates so hue lights stop flickering.",
      ...opts.sections,
    },
  });
}

function labelObjects(names: readonly string[]): { name: string }[] {
  return names.map((name) => ({ name }));
}

/**
 * Baseline pull_request webhook payload: PR #21, a bugfix touching hue,
 * open and not a draft. Override `pull_request` fields (labels as plain
 * strings) and add top-level fields (`label`, `review`) via `extra`.
 */
export function prPayload(
  action: string,
  pr: Record<string, unknown> & { labels?: string[] } = {},
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const { labels, ...prOverrides } = pr;
  return {
    action,
    number: 21,
    sender: SENDER,
    repository: REPOSITORY,
    pull_request: {
      number: 21,
      node_id: "PR_21",
      title: "Fix hue light flicker during brightness transitions",
      head: { sha: "abc123" },
      base: { ref: "dev" },
      labels: labelObjects(labels ?? []),
      body: prBody({ checked: ["bugfix"] }),
      user: { login: "contributor" },
      author_association: "CONTRIBUTOR",
      assignees: [],
      draft: false,
      merged: false,
      merged_at: null,
      state: "open",
      ...prOverrides,
    },
    ...extra,
  };
}

/** Baseline issues webhook payload: issue #23 about hue. */
export function issuePayload(
  action: string,
  issue: Record<string, unknown> & { labels?: string[] } = {},
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const { labels, ...issueOverrides } = issue;
  return {
    action,
    sender: SENDER,
    repository: REPOSITORY,
    issue: {
      number: 23,
      title: "Hue lights become unavailable after bridge firmware update",
      body: "After the latest bridge firmware update, all hue lights drop out after a few hours.",
      labels: labelObjects(labels ?? []),
      user: { login: "contributor" },
      assignees: [],
      state: "open",
      ...issueOverrides,
    },
    ...extra,
  };
}

/**
 * Baseline issue_comment.created payload on the PR (#21, via the issue view's
 * pull_request cross-link). Pass `issue` overrides with `pull_request: undefined`
 * to comment on a plain issue instead.
 */
export function commentPayload(
  body: string,
  issue: Record<string, unknown> & { labels?: string[] } = {},
): Record<string, unknown> {
  const { labels, ...issueOverrides } = issue;
  return {
    action: "created",
    sender: SENDER,
    repository: REPOSITORY,
    issue: {
      number: 21,
      title: "Fix hue light flicker during brightness transitions",
      pull_request: { url: "https://api.github.com/repos/home-assistant/core/pulls/21" },
      labels: labelObjects(labels ?? []),
      body: prBody({ checked: ["bugfix"] }),
      user: { login: "contributor" },
      assignees: [],
      state: "open",
      ...issueOverrides,
    },
    comment: {
      id: 42,
      body,
      user: { login: "contributor" },
      author_association: "NONE",
    },
  };
}

// ── The world behind the mocks ───────────────────────────────────────────────

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

/**
 * The pulls.get response backing lazy hydration: the payload's own
 * pull_request when it carries one, minimal PR-shaped defaults for comment
 * payloads (which only carry the issue view), plus state overrides.
 */
function hydrationPullRequest(scenario: Scenario): Record<string, unknown> {
  const payload = scenario.payload as {
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
    ...scenario.state?.pullRequest,
    mergeable_state: scenario.state?.mergeableState ?? "clean",
  };
}

function mockGitHubFor(scenario: Scenario) {
  const github = createMockGitHub();
  const state = scenario.state ?? {};

  github.pulls.get.mockResolvedValue({ data: hydrationPullRequest(scenario) });

  github.pulls.listFiles.mockResolvedValue({
    data: (state.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status ?? "modified",
      additions: f.additions ?? 10,
      deletions: 0,
    })),
  });

  const members = state.members ?? [];
  github.orgs.checkMembershipForUser.mockImplementation(
    async ({ username }: { username: string }) =>
      members.includes(username) ? { status: 204 } : Promise.reject({ status: 404 }),
  );

  if (state.codeowners) {
    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(state.codeowners) },
      headers: {},
    });
  }

  // In-memory comment store so the status comment round-trips: the dispatcher
  // creates a placeholder, then finds and updates it via listComments.
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

  return github;
}

// ── Runner ───────────────────────────────────────────────────────────────────

/**
 * Dispatch one webhook scenario through the real pipeline — the same routing
 * the webhook entrypoint does (command comments go through dispatchCommand,
 * everything else through rule dispatch), against the real manifest registry.
 * Effect application runs for real against the mocks; the returned effect
 * list is what tests snapshot.
 *
 * Every run also verifies label independence: for each label the dispatch
 * added or removed, the synthetic labeled/unlabeled event is dispatched once
 * more and must produce nothing new — a rule that reacts to a bot-set label
 * depends on another rule, and its output would be lost in production (the
 * bot's own label writes come back as self-webhooks, which are dropped).
 */
export async function runScenario(scenario: Scenario): Promise<Effect[]> {
  const github = mockGitHubFor(scenario);
  const octokit = github as unknown as Octokit;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = routeFetch(scenario.state?.remote ?? {});
  try {
    let effects: Effect[];
    const payload = scenario.payload;
    const commentBody = (payload as { comment?: { body?: string } }).comment?.body ?? "";

    if (
      scenario.eventType === EventType.ISSUE_COMMENT_CREATED &&
      isBotCommand(commentBody, testEnv.COMMAND_SLUG)
    ) {
      const context = commandContextFromWebhook(
        testEnv,
        registryConfig,
        octokit,
        payload as unknown as IssueCommentCreatedEvent,
      );
      effects = (await dispatchCommand(context)) ?? [];
    } else {
      effects = await dispatch(
        ruleContextFromWebhook(
          testEnv,
          registryConfig,
          octokit,
          payload as unknown as WebhookEventPayload,
          scenario.eventType,
        ),
      );
    }

    await assertLabelIndependence(scenario, effects, octokit);
    return effects;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// ── Label independence ───────────────────────────────────────────────────────

function currentLabelNames(scenario: Scenario): string[] {
  const payload = scenario.payload as {
    pull_request?: { labels?: { name: string }[] };
    issue?: { labels?: { name: string }[] };
  };
  const labels = payload.pull_request?.labels ?? payload.issue?.labels ?? [];
  return labels.map((l) => l.name);
}

/** Whether an effect from the synthetic round changes anything round one didn't. */
function isRedundant(effect: Effect, labels: ReadonlySet<string>, firstRound: Effect[]): boolean {
  if (effect.type === "addLabels") return effect.labels.every((l) => labels.has(l));
  if (effect.type === "removeLabels") return effect.labels.every((l) => !labels.has(l));
  const serialized = JSON.stringify(effect);
  return firstRound.some((e) => JSON.stringify(e) === serialized);
}

/**
 * The synthetic labeled/unlabeled delivery GitHub would send for a label
 * change, built from the scenario's own payload. Undefined when no matching
 * EventType exists (issue unlabels).
 */
function syntheticLabelPayload(
  scenario: Scenario,
  change: { name: string; action: "labeled" | "unlabeled" },
  labels: string[],
): { eventType: EventType; payload: Record<string, unknown> } | undefined {
  const payload = scenario.payload as {
    pull_request?: Record<string, unknown>;
    issue?: { pull_request?: unknown } & Record<string, unknown>;
  };

  const isPullRequest = payload.pull_request || payload.issue?.pull_request;
  if (isPullRequest) {
    const pr = payload.pull_request ?? hydrationPullRequest(scenario);
    return {
      eventType:
        change.action === "labeled"
          ? EventType.PULL_REQUEST_LABELED
          : EventType.PULL_REQUEST_UNLABELED,
      payload: {
        action: change.action,
        label: { name: change.name },
        sender: SENDER,
        repository: REPOSITORY,
        pull_request: { ...pr, labels: labelObjects(labels) },
      },
    };
  }

  if (change.action !== "labeled") return undefined;
  return {
    eventType: EventType.ISSUES_LABELED,
    payload: {
      action: "labeled",
      label: { name: change.name },
      sender: SENDER,
      repository: REPOSITORY,
      issue: { ...payload.issue, labels: labelObjects(labels) },
    },
  };
}

async function assertLabelIndependence(
  scenario: Scenario,
  effects: Effect[],
  octokit: Octokit,
): Promise<void> {
  const current = new Set(currentLabelNames(scenario));
  const added = new Set<string>();
  const removed = new Set<string>();
  for (const effect of effects) {
    if (effect.type === "addLabels") for (const l of effect.labels) added.add(l);
    else if (effect.type === "removeLabels") for (const l of effect.labels) removed.add(l);
  }
  const adds = [...added].filter((l) => !current.has(l));
  const removes = [...removed].filter((l) => current.has(l) && !added.has(l));
  if (adds.length === 0 && removes.length === 0) return;

  const simulated = new Set(current);
  for (const name of adds) simulated.add(name);
  for (const name of removes) simulated.delete(name);

  const changes = [
    ...adds.map((name) => ({ name, action: "labeled" as const })),
    ...removes.map((name) => ({ name, action: "unlabeled" as const })),
  ];

  for (const change of changes) {
    const synthetic = syntheticLabelPayload(scenario, change, [...simulated]);
    if (!synthetic) continue;

    const context = ruleContextFromWebhook(
      testEnv,
      registryConfig,
      octokit,
      synthetic.payload as unknown as WebhookEventPayload,
      synthetic.eventType,
    );

    for (const rule of matchRules(context)) {
      const handler = rule.events[context.eventType];
      if (!handler) continue;
      // The dispatcher tolerates handler errors (allSettled + log); an error
      // here produces no effects, so it cannot depend on labels.
      const reaction =
        (await (handler as (ctx: RuleContext) => Promise<Effect[] | undefined>)(context).catch(
          () => undefined,
        )) ?? [];

      for (const effect of reaction) {
        if (!isRedundant(effect, simulated, effects)) {
          throw new Error(
            `rule "${rule.name}" depends on the bot-set label "${change.name}": ` +
              `a synthetic ${change.action} event produced ${JSON.stringify(effect)}, ` +
              `which the dispatch never applied — the rule must derive this itself`,
          );
        }
      }
    }
  }
}
