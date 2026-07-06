import type { Mock } from "bun:test";
import { mock } from "bun:test";
import type { Octokit } from "@octokit/rest";
import type { DashboardSection } from "../../../src/github/engine/dashboard/types.js";
import { EventType } from "../../../src/github/engine/event.js";
import type { WebhookEventPayload } from "../../../src/github/engine/model/from-webhook.js";
import { contextFromWebhook } from "../../../src/github/engine/model/from-webhook.js";
import type { RuleContext } from "../../../src/github/engine/rule-context.js";
import type { Effect, Rule } from "../../../src/github/engine/types.js";

/** bun's `Mock` requires a signature; the octokit mocks are loosely typed. */
type MockFn = Mock<(...args: never[]) => unknown>;

export interface MockGitHub {
  issues: {
    createComment: MockFn;
    updateComment: MockFn;
    listComments: MockFn;
    addLabels: MockFn;
    removeLabel: MockFn;
    get: MockFn;
    getLabel: MockFn;
    addAssignees: MockFn;
    removeAssignees: MockFn;
    update: MockFn;
  };
  pulls: {
    get: MockFn;
    list: MockFn;
    listFiles: MockFn;
    createReview: MockFn;
    listReviews: MockFn;
    listReviewComments: MockFn;
    update: MockFn;
    updateBranch: MockFn;
    requestReviewers: MockFn;
    dismissReview: MockFn;
    listCommits: MockFn;
  };
  repos: {
    createCommitStatus: MockFn;
    getContent: MockFn;
    listCommitStatusesForRef: MockFn;
  };
  teams: {
    listMembersInOrg: MockFn;
  };
  orgs: {
    getMembershipForUser: MockFn;
    checkMembershipForUser: MockFn;
  };
  reactions: {
    createForIssueComment: MockFn;
    listForPullRequestReviewComment: MockFn;
  };
  paginate: MockFn;
  graphql: MockFn;
}

export function createMockPayload(overrides: Record<string, unknown> = {}) {
  const { pull_request: prOverride, ...restOverrides } = overrides;
  return {
    action: "opened",
    number: 1,
    sender: { login: "testuser", type: "User" },
    repository: {
      full_name: "home-assistant/core",
      name: "core",
      owner: { login: "home-assistant" },
    },
    pull_request: {
      number: 1,
      node_id: "PR_1",
      head: { sha: "abc123" },
      base: { ref: "dev" },
      labels: [],
      body: "",
      user: { login: "testuser" },
      state: "open",
      draft: false,
      merged: false,
      merged_at: null,
      assignees: [],
      ...(prOverride as Record<string, unknown>),
    },
    ...restOverrides,
  };
}

export function createMockIssuePayload(overrides: Record<string, unknown> = {}) {
  const { issue: issueOverride, ...restOverrides } = overrides;
  return {
    action: "opened",
    number: 1,
    sender: { login: "testuser", type: "User" },
    repository: {
      full_name: "home-assistant/core",
      name: "core",
      owner: { login: "home-assistant" },
    },
    issue: {
      number: 1,
      body: "",
      user: { login: "testuser" },
      assignees: [] as { login: string }[],
      labels: [] as { name: string }[],
      ...(issueOverride as Record<string, unknown>),
    },
    ...restOverrides,
  };
}

export function createMockGitHub(): MockGitHub {
  return {
    issues: {
      createComment: mock().mockResolvedValue({ data: {} }),
      updateComment: mock().mockResolvedValue({ data: {} }),
      listComments: mock().mockResolvedValue({ data: [] }),
      addLabels: mock().mockResolvedValue({ data: {} }),
      removeLabel: mock().mockResolvedValue({ data: {} }),
      get: mock().mockResolvedValue({ data: {} }),
      getLabel: mock().mockResolvedValue({ data: {} }),
      addAssignees: mock().mockResolvedValue({ data: {} }),
      removeAssignees: mock().mockResolvedValue({ data: {} }),
      update: mock().mockResolvedValue({ data: {} }),
    },
    pulls: {
      get: mock().mockResolvedValue({ data: {} }),
      list: mock().mockResolvedValue({ data: [] }),
      listFiles: mock().mockResolvedValue({ data: [] }),
      createReview: mock().mockResolvedValue({ data: {} }),
      listReviews: mock().mockResolvedValue({ data: [] }),
      listReviewComments: mock().mockResolvedValue({ data: [] }),
      update: mock().mockResolvedValue({ data: {} }),
      updateBranch: mock().mockResolvedValue({ data: {} }),
      requestReviewers: mock().mockResolvedValue({ data: {} }),
      dismissReview: mock().mockResolvedValue({ data: {} }),
      listCommits: mock().mockResolvedValue({ data: [] }),
    },
    repos: {
      createCommitStatus: mock().mockResolvedValue({ data: {} }),
      getContent: mock().mockResolvedValue({ data: {} }),
      listCommitStatusesForRef: mock().mockResolvedValue({ data: [] }),
    },
    teams: {
      listMembersInOrg: mock().mockResolvedValue({ data: [] }),
    },
    orgs: {
      getMembershipForUser: mock().mockResolvedValue({ data: { role: "member" } }),
      checkMembershipForUser: mock().mockResolvedValue({ status: 204 }),
    },
    reactions: {
      createForIssueComment: mock().mockResolvedValue({ data: {} }),
      listForPullRequestReviewComment: mock().mockResolvedValue({ data: [] }),
    },
    // Delegates to the per-endpoint mock so tests can keep mocking e.g.
    // pulls.listReviews and have entity accessors (which paginate) see it.
    paginate: mock().mockImplementation(async (fn: unknown, params: unknown) => {
      if (typeof fn === "function") {
        const response = await fn(params);
        return response?.data ?? [];
      }
      return [];
    }),
    graphql: mock().mockResolvedValue({}),
  };
}

/** Cast MockGitHub to Octokit for use in WebhookContext */
function asOctokit(mock: MockGitHub): Octokit {
  return mock as unknown as Octokit;
}

export function createMockContext(
  overrides: {
    eventType?: EventType;
    payload?: Record<string, unknown>;
    github?: MockGitHub;
    dryRun?: boolean;
  } = {},
): RuleContext {
  const github = overrides.github ?? createMockGitHub();
  const eventType = overrides.eventType ?? EventType.PULL_REQUEST_OPENED;
  const payload = createMockPayload(overrides.payload);

  return contextFromWebhook(
    asOctokit(github),
    payload as unknown as WebhookEventPayload,
    eventType,
    {
      botSlug: "ha-bot",
      dryRun: overrides.dryRun,
    },
  );
}

export function createMockIssueContext(
  overrides: { eventType?: EventType; payload?: Record<string, unknown>; github?: MockGitHub } = {},
): RuleContext {
  const github = overrides.github ?? createMockGitHub();
  const eventType = overrides.eventType ?? EventType.ISSUES_OPENED;
  const payload = createMockIssuePayload(overrides.payload);

  return contextFromWebhook(
    asOctokit(github),
    payload as unknown as WebhookEventPayload,
    eventType,
    { botSlug: "ha-bot" },
  );
}

/** Pre-populate the target PR's files cache (bypasses the paginate call). */
export function mockPRFiles(context: RuleContext, files: Record<string, unknown>[]) {
  const target = context.target as unknown as { caches: { files?: Promise<unknown> } };
  target.caches.files = Promise.resolve(files);
}

export function lastSegment(path: string): string {
  return path.split("/").pop() ?? path;
}

export interface StatusCheckLike {
  context: string;
  state: "success" | "failure" | "pending";
  description: string;
  sha?: string;
}

/**
 * Backward-compatible result summary surfaced to existing tests so they
 * can keep asserting against fields like `labels`, `statusCheck`, etc.
 * The `effects` field exposes the raw array for new-style assertions.
 */
export interface RuleSummary {
  effects: Effect[];
  labels?: string[];
  removeLabels?: string[];
  comment?: string;
  comments: string[];
  requestChanges?: string;
  assignees?: string[];
  statusCheck?: StatusCheckLike;
  statusChecks: StatusCheckLike[];
  dashboard?: DashboardSection;
  dashboards: DashboardSection[];
}

export function summarizeEffects(effects: Effect[] | undefined): RuleSummary | undefined {
  if (!effects) return undefined;

  const labels: string[] = [];
  const removeLabels: string[] = [];
  const comments: string[] = [];
  const reviewBodies: string[] = [];
  const assignees: string[] = [];
  const statusChecks: StatusCheckLike[] = [];
  const dashboards: DashboardSection[] = [];

  for (const e of effects) {
    switch (e.type) {
      case "addLabels":
        labels.push(...e.labels);
        break;
      case "removeLabels":
        removeLabels.push(...e.labels);
        break;
      case "comment":
        comments.push(e.body);
        break;
      case "requestChanges":
        reviewBodies.push(e.body);
        break;
      case "addAssignees":
        assignees.push(...e.assignees);
        break;
      case "statusCheck":
        statusChecks.push({
          context: e.context,
          state: e.state,
          description: e.description,
          sha: e.sha,
        });
        break;
      case "dashboardSection":
        dashboards.push(e.section);
        break;
    }
  }

  return {
    effects,
    labels: labels.length ? labels : undefined,
    removeLabels: removeLabels.length ? removeLabels : undefined,
    comment: comments[0],
    comments,
    requestChanges: reviewBodies[0],
    assignees: assignees.length ? assignees : undefined,
    statusCheck: statusChecks[0],
    statusChecks,
    dashboard: dashboards[0],
    dashboards,
  };
}

/**
 * Invokes the rule's handler registered for `context.eventType` and
 * returns a `RuleSummary` view of the effects (or `undefined` if the
 * handler returned nothing or the rule does not handle this event).
 */
export async function runRule(rule: Rule, context: RuleContext): Promise<RuleSummary | undefined> {
  const handler = rule.events[context.eventType];
  if (!handler) return undefined;
  const effects = await (handler as (ctx: RuleContext) => Promise<Effect[] | undefined>)(context);
  return summarizeEffects(effects);
}
