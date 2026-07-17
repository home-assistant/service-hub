import type { Octokit } from "@octokit/rest";
import { type Mock, vi } from "vitest";
import type { Env } from "../../../src/env.js";
import type { RegistryConfig } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import type {
  RuleContext,
  WebhookEventPayload,
} from "../../../src/github/engine/model/rule-context.js";
import { ruleContextFromWebhook } from "../../../src/github/engine/model/rule-context.js";
import type { StatusSection } from "../../../src/github/engine/status/types.js";
import type { Effect, Rule } from "../../../src/github/engine/types.js";

/** The octokit mocks are loosely typed. */
type MockFn = Mock<(...args: never[]) => unknown>;

/** Fake Env for contexts built outside the webhook handler. */
export const testEnv: Env = {
  GITHUB_APP_ID: "1",
  GITHUB_PRIVATE_KEY: "test-key",
  GITHUB_INSTALLATION_ID: "1",
  GITHUB_WEBHOOK_SECRET: "test-secret",
  BOT_SLUG: "ha-bot",
  COMMAND_SLUG: "ha-bot",
  SENTRY_DSN: "",
  ENVIRONMENT: "test",
};

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
      createComment: vi.fn().mockResolvedValue({ data: {} }),
      updateComment: vi.fn().mockResolvedValue({ data: {} }),
      listComments: vi.fn().mockResolvedValue({ data: [] }),
      addLabels: vi.fn().mockResolvedValue({ data: {} }),
      removeLabel: vi.fn().mockResolvedValue({ data: {} }),
      get: vi.fn().mockResolvedValue({ data: {} }),
      getLabel: vi.fn().mockResolvedValue({ data: {} }),
      addAssignees: vi.fn().mockResolvedValue({ data: {} }),
      removeAssignees: vi.fn().mockResolvedValue({ data: {} }),
      update: vi.fn().mockResolvedValue({ data: {} }),
    },
    pulls: {
      get: vi.fn().mockResolvedValue({ data: {} }),
      list: vi.fn().mockResolvedValue({ data: [] }),
      listFiles: vi.fn().mockResolvedValue({ data: [] }),
      createReview: vi.fn().mockResolvedValue({ data: {} }),
      listReviews: vi.fn().mockResolvedValue({ data: [] }),
      listReviewComments: vi.fn().mockResolvedValue({ data: [] }),
      update: vi.fn().mockResolvedValue({ data: {} }),
      updateBranch: vi.fn().mockResolvedValue({ data: {} }),
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
      checkMembershipForUser: vi.fn().mockResolvedValue({ status: 204 }),
    },
    reactions: {
      createForIssueComment: vi.fn().mockResolvedValue({ data: {} }),
      listForPullRequestReviewComment: vi.fn().mockResolvedValue({ data: [] }),
    },
    // Delegates to the per-endpoint mock so tests can keep mocking e.g.
    // pulls.listReviews and have entity accessors (which paginate) see it.
    paginate: vi.fn().mockImplementation(async (fn: unknown, params: unknown) => {
      if (typeof fn === "function") {
        const response = await fn(params);
        return response?.data ?? [];
      }
      return [];
    }),
    graphql: vi.fn().mockResolvedValue({}),
  };
}

/** Cast MockGitHub to Octokit for use in WebhookContext */
function asOctokit(mock: MockGitHub): Octokit {
  return mock as unknown as Octokit;
}

interface MockContextOverrides {
  eventType?: EventType;
  payload?: Record<string, unknown>;
  github?: MockGitHub;
  registry?: RegistryConfig;
}

export function createMockContext(overrides: MockContextOverrides = {}): RuleContext {
  const github = overrides.github ?? createMockGitHub();
  const eventType = overrides.eventType ?? EventType.PULL_REQUEST_OPENED;
  const payload = createMockPayload(overrides.payload);

  return ruleContextFromWebhook(
    testEnv,
    overrides.registry ?? { repositories: {} },
    asOctokit(github),
    payload as unknown as WebhookEventPayload,
    eventType,
  );
}

export function createMockIssueContext(overrides: MockContextOverrides = {}): RuleContext {
  const github = overrides.github ?? createMockGitHub();
  const eventType = overrides.eventType ?? EventType.ISSUES_OPENED;
  const payload = createMockIssuePayload(overrides.payload);

  return ruleContextFromWebhook(
    testEnv,
    overrides.registry ?? { repositories: {} },
    asOctokit(github),
    payload as unknown as WebhookEventPayload,
    eventType,
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

/**
 * Convenience views over a handler's effects so tests can assert against
 * fields like `labels` or `section` directly. The `effects` field exposes
 * the raw array for new-style assertions.
 */
export interface RuleSummary {
  effects: Effect[];
  labels?: string[];
  removeLabels?: string[];
  comment?: string;
  comments: string[];
  assignees?: string[];
  section?: StatusSection;
  sections: StatusSection[];
}

export function summarizeEffects(effects: Effect[] | undefined): RuleSummary | undefined {
  if (!effects) return undefined;

  const labels: string[] = [];
  const removeLabels: string[] = [];
  const comments: string[] = [];
  const assignees: string[] = [];
  const sections: StatusSection[] = [];

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
      case "addAssignees":
        assignees.push(...e.assignees);
        break;
      case "statusSection":
        sections.push(e.section);
        break;
    }
  }

  return {
    effects,
    labels: labels.length ? labels : undefined,
    removeLabels: removeLabels.length ? removeLabels : undefined,
    comment: comments[0],
    comments,
    assignees: assignees.length ? assignees : undefined,
    section: sections[0],
    sections,
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
