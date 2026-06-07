import type { Octokit } from "@octokit/rest";
import type { Mock } from "vitest";
import { vi } from "vitest";
import type { WebhookEventPayload } from "../../src/context/webhook-context.js";
import { WebhookContext } from "../../src/context/webhook-context.js";
import type { DashboardSection } from "../../src/dashboard/types.js";
import { EventType } from "../../src/github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../../src/rules/types.js";

export interface MockGitHub {
  issues: {
    createComment: Mock;
    updateComment: Mock;
    listComments: Mock;
    addLabels: Mock;
    removeLabel: Mock;
    get: Mock;
    getLabel: Mock;
    addAssignees: Mock;
  };
  pulls: {
    get: Mock;
    list: Mock;
    listFiles: Mock;
    createReview: Mock;
    listReviews: Mock;
    listReviewComments: Mock;
    update: Mock;
    requestReviewers: Mock;
    dismissReview: Mock;
    listCommits: Mock;
  };
  repos: {
    createCommitStatus: Mock;
    getContent: Mock;
    listCommitStatusesForRef: Mock;
  };
  teams: {
    listMembersInOrg: Mock;
  };
  orgs: {
    getMembershipForUser: Mock;
  };
  reactions: {
    createForIssueComment: Mock;
    listForPullRequestReviewComment: Mock;
  };
  paginate: Mock;
  graphql: Mock;
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
      createComment: vi.fn().mockResolvedValue({ data: {} }),
      updateComment: vi.fn().mockResolvedValue({ data: {} }),
      listComments: vi.fn().mockResolvedValue({ data: [] }),
      addLabels: vi.fn().mockResolvedValue({ data: {} }),
      removeLabel: vi.fn().mockResolvedValue({ data: {} }),
      get: vi.fn().mockResolvedValue({ data: {} }),
      getLabel: vi.fn().mockResolvedValue({ data: {} }),
      addAssignees: vi.fn().mockResolvedValue({ data: {} }),
    },
    pulls: {
      get: vi.fn().mockResolvedValue({ data: {} }),
      list: vi.fn().mockResolvedValue({ data: [] }),
      listFiles: vi.fn().mockResolvedValue({ data: [] }),
      createReview: vi.fn().mockResolvedValue({ data: {} }),
      listReviews: vi.fn().mockResolvedValue({ data: [] }),
      listReviewComments: vi.fn().mockResolvedValue({ data: [] }),
      update: vi.fn().mockResolvedValue({ data: {} }),
      requestReviewers: vi.fn().mockResolvedValue({ data: {} }),
      dismissReview: vi.fn().mockResolvedValue({ data: {} }),
      listCommits: vi.fn().mockResolvedValue({ data: [] }),
    },
    repos: {
      createCommitStatus: vi.fn().mockResolvedValue({ data: {} }),
      getContent: vi.fn().mockResolvedValue({ data: {} }),
      listCommitStatusesForRef: vi.fn().mockResolvedValue({ data: [] }),
    },
    teams: {
      listMembersInOrg: vi.fn().mockResolvedValue({ data: [] }),
    },
    orgs: {
      getMembershipForUser: vi.fn().mockResolvedValue({ data: { role: "member" } }),
    },
    reactions: {
      createForIssueComment: vi.fn().mockResolvedValue({ data: {} }),
      listForPullRequestReviewComment: vi.fn().mockResolvedValue({ data: [] }),
    },
    paginate: vi.fn().mockImplementation(async () => []),
    graphql: vi.fn().mockResolvedValue({}),
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
): WebhookContext {
  const github = overrides.github ?? createMockGitHub();
  const eventType = overrides.eventType ?? EventType.PULL_REQUEST_OPENED;
  const payload = createMockPayload(overrides.payload);

  return new WebhookContext({
    github: asOctokit(github),
    payload: payload as unknown as WebhookEventPayload,
    eventType,
    botSlug: "ha-bot",
    dryRun: overrides.dryRun,
  });
}

export function createMockIssueContext(
  overrides: { eventType?: EventType; payload?: Record<string, unknown>; github?: MockGitHub } = {},
): WebhookContext {
  const github = overrides.github ?? createMockGitHub();
  const eventType = overrides.eventType ?? EventType.ISSUES_OPENED;
  const payload = createMockIssuePayload(overrides.payload);

  return new WebhookContext({
    github: asOctokit(github),
    payload: payload as unknown as WebhookEventPayload,
    eventType,
    botSlug: "ha-bot",
  });
}

/** Helper to mock fetchPRFiles by pre-populating the cache */
export function mockPRFiles(context: WebhookContext, files: Record<string, unknown>[]) {
  context.prFilesCache = files as WebhookContext["prFilesCache"];
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
      case "removeLabel":
        removeLabels.push(e.label);
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
export async function runRule(
  rule: Rule,
  context: WebhookContext,
): Promise<RuleSummary | undefined> {
  const handler = rule.events[context.eventType as keyof EventPayloadMap];
  if (!handler) return undefined;
  const effects = await (handler as (ctx: WebhookContext) => Promise<Effect[] | undefined>)(
    context,
  );
  return summarizeEffects(effects);
}
