import type { Octokit } from "@octokit/rest";
import { vi } from "vitest";
import { WebhookContext } from "../../src/context/webhook-context.js";
import type { Database } from "../../src/db/types.js";
import { EventType } from "../../src/github/types.js";

export function createMockPayload(overrides: Record<string, unknown> = {}) {
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
      ...(overrides.pull_request as Record<string, unknown>),
    },
    ...overrides,
  };
}

export function createMockIssuePayload(overrides: Record<string, unknown> = {}) {
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
      ...(overrides.issue as Record<string, unknown>),
    },
    ...overrides,
  };
}

export function createMockGitHub() {
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
  } as unknown as Octokit;
}

export function createMockDb(): Database {
  return {
    query: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ changes: 0 }),
    queryOne: vi.fn().mockResolvedValue(null),
  };
}

export function createMockContext(
  overrides: {
    eventType?: EventType;
    payload?: Record<string, unknown>;
    github?: Octokit;
    db?: Database;
  } = {},
): WebhookContext {
  const github = overrides.github ?? createMockGitHub();
  const db = overrides.db ?? createMockDb();
  const eventType = overrides.eventType ?? EventType.PULL_REQUEST_OPENED;
  const payload = createMockPayload(overrides.payload);

  return new WebhookContext({ github, payload, eventType, db });
}

export function createMockIssueContext(
  overrides: {
    eventType?: EventType;
    payload?: Record<string, unknown>;
    github?: Octokit;
    db?: Database;
  } = {},
): WebhookContext {
  const github = overrides.github ?? createMockGitHub();
  const db = overrides.db ?? createMockDb();
  const eventType = overrides.eventType ?? EventType.ISSUES_OPENED;
  const payload = createMockIssuePayload(overrides.payload);

  return new WebhookContext({ github, payload, eventType, db });
}

/** Helper to mock fetchPRFiles by pre-populating the cache */
export function mockPRFiles(context: WebhookContext, files: Record<string, unknown>[]) {
  context._prFilesCache = files as WebhookContext["_prFilesCache"];
}
