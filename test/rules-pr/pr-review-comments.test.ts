import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prReviewComments } from "../../src/rules-pr/pr-review-comments.js";
import { createMockContext, createMockGitHub, runRule } from "../helpers/mock-context.js";

const AUTHOR = "pr-author";

function reviewComment(opts: {
  id: number;
  user: string;
  in_reply_to_id?: number;
  html_url?: string;
}) {
  return {
    id: opts.id,
    user: { login: opts.user },
    in_reply_to_id: opts.in_reply_to_id,
    html_url: opts.html_url ?? `https://github.com/x/y/pull/1#discussion_r${opts.id}`,
  };
}

function setupHarness(reviewComments: object[], reactions: Record<number, object[]> = {}) {
  const github = createMockGitHub();
  // paginate handles both listReviewComments and listForPullRequestReviewComment;
  // dispatch based on which method-like was passed in.
  github.paginate.mockImplementation(async (fn: unknown, params: { comment_id?: number }) => {
    if (fn === github.pulls.listReviewComments) return reviewComments;
    if (fn === github.reactions.listForPullRequestReviewComment) {
      return reactions[params?.comment_id ?? -1] ?? [];
    }
    return [];
  });
  return { github };
}

describe("pr-review-comments", () => {
  it("skips when there are no inline review comments", async () => {
    const { github } = setupHarness([]);
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      payload: { pull_request: { head: { sha: "abc" }, user: { login: AUTHOR } } },
    });

    const result = await runRule(prReviewComments, context);
    expect(result?.dashboard).toMatchObject({ id: "review-comments", status: "skip" });
  });

  it("passes when every reviewer comment has been replied to", async () => {
    const { github } = setupHarness([
      reviewComment({ id: 1, user: "reviewer" }),
      reviewComment({ id: 2, user: AUTHOR, in_reply_to_id: 1 }),
    ]);
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      github,
      payload: { pull_request: { head: { sha: "abc" }, user: { login: AUTHOR } } },
    });

    const result = await runRule(prReviewComments, context);
    expect(result?.dashboard?.status).toBe("pass");
  });

  it("passes when reviewer comment is acknowledged via reaction", async () => {
    const { github } = setupHarness([reviewComment({ id: 1, user: "reviewer" })], {
      1: [{ user: { login: AUTHOR }, content: "+1" }],
    });
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
      github,
      payload: { pull_request: { head: { sha: "abc" }, user: { login: AUTHOR } } },
    });

    const result = await runRule(prReviewComments, context);
    expect(result?.dashboard?.status).toBe("pass");
  });

  it("fails when reviewer comments are unaddressed and links to each one", async () => {
    const { github } = setupHarness([
      reviewComment({
        id: 1,
        user: "reviewer",
        html_url: "https://github.com/x/y/pull/1#discussion_r1",
      }),
      reviewComment({
        id: 2,
        user: "another",
        html_url: "https://github.com/x/y/pull/1#discussion_r2",
      }),
    ]);
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
      github,
      payload: { pull_request: { head: { sha: "abc" }, user: { login: AUTHOR } } },
    });

    const result = await runRule(prReviewComments, context);
    expect(result?.dashboard?.status).toBe("fail");
    expect(result?.dashboard?.message).toContain("discussion_r1");
    expect(result?.dashboard?.message).toContain("discussion_r2");
  });

  it("ignores comments authored by the PR author themselves", async () => {
    const { github } = setupHarness([reviewComment({ id: 1, user: AUTHOR })]);
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
      github,
      payload: { pull_request: { head: { sha: "abc" }, user: { login: AUTHOR } } },
    });

    const result = await runRule(prReviewComments, context);
    expect(result?.dashboard?.status).toBe("pass");
  });

  it("listens to the right PR events", () => {
    const keys = Object.keys(prReviewComments.events);
    expect(keys).toContain(EventType.PULL_REQUEST_OPENED);
    expect(keys).toContain(EventType.PULL_REQUEST_REOPENED);
    expect(keys).toContain(EventType.PULL_REQUEST_READY_FOR_REVIEW);
    expect(keys).toContain(EventType.PULL_REQUEST_REVIEW_SUBMITTED);
    expect(keys).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
  });
});
