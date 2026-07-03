import type { Octokit } from "@octokit/rest";
import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/engine/event.js";
import type { WebhookEventPayload } from "../../../src/engine/model/from-webhook.js";
import {
  contextFromPullRequest,
  contextFromWebhook,
} from "../../../src/engine/model/from-webhook.js";
import { Issue } from "../../../src/engine/model/issue.js";
import type { GetPullRequestResponse } from "../../../src/engine/model/pull-request.js";
import { PullRequest } from "../../../src/engine/model/pull-request.js";
import { createMockGitHub, type MockGitHub } from "../../helpers/mock-context.js";

const OPTS = { botSlug: "ha-bot" };

function asOctokit(mock: MockGitHub): Octokit {
  return mock as unknown as Octokit;
}

const repository = {
  full_name: "home-assistant/core",
  name: "core",
  owner: { login: "home-assistant" },
  topics: ["hacktoberfest"],
};

function prPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: "opened",
    sender: { login: "testuser", type: "User" },
    repository,
    pull_request: {
      number: 42,
      node_id: "PR_42",
      labels: [{ name: "bugfix" }],
      body: "the body",
      user: { login: "testuser" },
      author_association: "CONTRIBUTOR",
      assignees: [],
      draft: false,
      head: { sha: "abc123" },
      base: { ref: "dev" },
      merged: false,
      merged_at: null,
      state: "open",
    },
    ...overrides,
  } as unknown as WebhookEventPayload;
}

describe("contextFromWebhook", () => {
  it("seeds a PR target fully from a pull_request payload — no hydration on read", async () => {
    const github = createMockGitHub();
    const ctx = contextFromWebhook(
      asOctokit(github),
      prPayload(),
      EventType.PULL_REQUEST_OPENED,
      OPTS,
    );

    expect(ctx.repository).toBe("home-assistant/core");
    expect(ctx.organization).toBe("home-assistant");
    expect(ctx.repo.topics).toEqual(["hacktoberfest"]);
    expect(ctx.sender).toEqual({ login: "testuser", isBot: false });
    expect(ctx.event).toEqual({ type: EventType.PULL_REQUEST_OPENED });

    const pr = ctx.target as PullRequest;
    expect(pr.number).toBe(42);
    expect(await pr.labels()).toEqual(["bugfix"]);
    expect(await pr.body()).toBe("the body");
    expect(await pr.headSha()).toBe("abc123");
    expect(await pr.baseRef()).toBe("dev");
    expect(await pr.merged()).toBe(false);
    expect(await pr.authorAssociation()).toBe("CONTRIBUTOR");
    expect(github.pulls.get).not.toHaveBeenCalled();
  });

  it("extracts the changed label on labeled/unlabeled events", () => {
    const github = createMockGitHub();
    const payload = prPayload({ action: "labeled", label: { name: "needs-docs" } });
    const ctx = contextFromWebhook(
      asOctokit(github),
      payload,
      EventType.PULL_REQUEST_LABELED,
      OPTS,
    );
    expect(ctx.event).toEqual({ type: EventType.PULL_REQUEST_LABELED, label: "needs-docs" });
  });

  it("extracts merged on closed events", () => {
    const github = createMockGitHub();
    const payload = prPayload({ action: "closed" });
    (payload as { pull_request: { merged: boolean } }).pull_request.merged = true;
    const ctx = contextFromWebhook(asOctokit(github), payload, EventType.PULL_REQUEST_CLOSED, OPTS);
    expect(ctx.event).toEqual({ type: EventType.PULL_REQUEST_CLOSED, merged: true });
  });

  it("leaves fields a review payload lacks unseeded — they hydrate on demand", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({ data: { merged: true } });
    // SimplePullRequest: no `merged` field
    const payload = prPayload({
      action: "submitted",
      review: { state: "approved", user: { login: "reviewer" } },
    });
    delete (payload as { pull_request: { merged?: boolean } }).pull_request.merged;

    const ctx = contextFromWebhook(
      asOctokit(github),
      payload,
      EventType.PULL_REQUEST_REVIEW_SUBMITTED,
      OPTS,
    );
    expect(ctx.event).toEqual({
      type: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
      reviewState: "approved",
      reviewer: "reviewer",
    });

    const pr = ctx.target as PullRequest;
    expect(await pr.labels()).toEqual(["bugfix"]); // seeded
    expect(await pr.merged()).toBe(true); // hydrated
    expect(github.pulls.get).toHaveBeenCalledTimes(1);
  });

  it("builds a PR target from an issue_comment payload on a PR", async () => {
    const github = createMockGitHub();
    const payload = {
      action: "created",
      sender: { login: "commenter", type: "User" },
      repository,
      comment: { id: 99, body: "nice work" },
      issue: {
        number: 7,
        pull_request: { url: "..." },
        labels: [{ name: "second-opinion-wanted" }],
        body: "pr body",
        user: { login: "author" },
        assignees: [],
        state: "open",
      },
    } as unknown as WebhookEventPayload;

    const ctx = contextFromWebhook(
      asOctokit(github),
      payload,
      EventType.ISSUE_COMMENT_CREATED,
      OPTS,
    );

    expect(ctx.event).toEqual({
      type: EventType.ISSUE_COMMENT_CREATED,
      commentId: 99,
      commentBody: "nice work",
    });
    expect(ctx.target).toBeInstanceOf(PullRequest);
    const pr = ctx.target as PullRequest;
    expect(pr.number).toBe(7);
    expect(await pr.labels()).toEqual(["second-opinion-wanted"]);
    expect(await pr.body()).toBe("pr body");
    expect(github.pulls.get).not.toHaveBeenCalled();
  });

  it("builds an Issue target for plain issue events", async () => {
    const github = createMockGitHub();
    const payload = {
      action: "opened",
      sender: { login: "reporter", type: "User" },
      repository,
      issue: {
        number: 3,
        labels: [{ name: "bug" }],
        body: "it broke",
        user: { login: "reporter" },
        assignees: [],
        state: "open",
      },
    } as unknown as WebhookEventPayload;

    const ctx = contextFromWebhook(asOctokit(github), payload, EventType.ISSUES_OPENED, OPTS);

    expect(ctx.target).toBeInstanceOf(Issue);
    const issue = ctx.target as Issue;
    expect(await issue.labels()).toEqual(["bug"]);
    expect(await issue.body()).toBe("it broke");
    expect(github.issues.get).not.toHaveBeenCalled();
  });

  it("flags Bot senders and the homeassistant account", () => {
    const github = createMockGitHub();
    const bot = contextFromWebhook(
      asOctokit(github),
      prPayload({ sender: { login: "dependabot[bot]", type: "Bot" } }),
      EventType.PULL_REQUEST_OPENED,
      OPTS,
    );
    expect(bot.senderIsBot).toBe(true);

    const ha = contextFromWebhook(
      asOctokit(github),
      prPayload({ sender: { login: "homeassistant", type: "User" } }),
      EventType.PULL_REQUEST_OPENED,
      OPTS,
    );
    expect(ha.senderIsBot).toBe(true);
  });
});

describe("contextFromPullRequest", () => {
  it("builds a fully seeded ON_DEMAND context from a REST response", async () => {
    const github = createMockGitHub();
    const pr = {
      number: 42,
      node_id: "PR_42",
      labels: [{ name: "bugfix" }],
      body: "the body",
      user: { login: "testuser", type: "User" },
      author_association: "CONTRIBUTOR",
      assignees: [],
      draft: false,
      head: { sha: "abc123" },
      base: { ref: "dev", repo: { ...repository } },
      merged: true,
      merged_at: "2026-01-01T00:00:00Z",
      state: "closed",
    } as unknown as GetPullRequestResponse;

    const ctx = contextFromPullRequest(asOctokit(github), pr, OPTS);

    expect(ctx.event).toEqual({ type: EventType.ON_DEMAND });
    expect(ctx.repository).toBe("home-assistant/core");
    const target = ctx.target as PullRequest;
    expect(await target.merged()).toBe(true);
    expect(await target.state()).toBe("closed");
    expect(github.pulls.get).not.toHaveBeenCalled();
  });
});
