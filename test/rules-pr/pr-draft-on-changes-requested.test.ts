import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prDraftOnChangesRequested } from "../../src/rules-pr/pr-draft-on-changes-requested.js";
import { createMockContext, createMockGitHub, runRule } from "../helpers/mock-context.js";

describe("pr-draft-on-changes-requested", () => {
  describe("review submitted", () => {
    it("emits convertPullRequestToDraft on changes_requested from org member", async () => {
      const github = createMockGitHub();
      github.paginate.mockResolvedValue([]);
      github.orgs.getMembershipForUser.mockResolvedValue({ data: { role: "member" } });

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        github,
        payload: {
          review: { user: { login: "reviewer" }, state: "changes_requested" },
          pull_request: { draft: false, node_id: "PR_1", user: { login: "author" } },
          sender: { login: "reviewer", type: "User" },
        },
      });

      const result = await runRule(prDraftOnChangesRequested, context);
      const convertEffect = result?.effects.find((e) => e.type === "convertPullRequestToDraft");
      expect(convertEffect).toMatchObject({ node_id: "PR_1" });
    });

    it("does nothing when PR is already a draft", async () => {
      const github = createMockGitHub();
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        github,
        payload: {
          review: { user: { login: "reviewer" }, state: "changes_requested" },
          pull_request: { draft: true, node_id: "PR_1", user: { login: "author" } },
          sender: { login: "reviewer", type: "User" },
        },
      });

      const result = await runRule(prDraftOnChangesRequested, context);
      expect(result).toBeUndefined();
    });

    it("does nothing for approved reviews", async () => {
      const github = createMockGitHub();
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        github,
        payload: {
          review: { user: { login: "reviewer" }, state: "approved" },
          pull_request: { draft: false, node_id: "PR_1", user: { login: "author" } },
          sender: { login: "reviewer", type: "User" },
        },
      });

      const result = await runRule(prDraftOnChangesRequested, context);
      expect(result).toBeUndefined();
    });

    it("does nothing for non-org-member reviewers", async () => {
      const github = createMockGitHub();
      github.orgs.getMembershipForUser.mockRejectedValue(new Error("Not a member"));

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        github,
        payload: {
          review: { user: { login: "external-user" }, state: "changes_requested" },
          pull_request: { draft: false, node_id: "PR_1", user: { login: "author" } },
          sender: { login: "external-user", type: "User" },
        },
      });

      const result = await runRule(prDraftOnChangesRequested, context);
      expect(result).toBeUndefined();
    });
  });

  describe("ready for review", () => {
    it("emits requestReviewers for human reviewers", async () => {
      const github = createMockGitHub();
      github.paginate.mockResolvedValue([
        { id: 1, body: "<!-- ReviewDrafterComment -->\nSome message" },
      ]);
      github.pulls.listReviews.mockResolvedValue({
        data: [{ id: 10, state: "CHANGES_REQUESTED", user: { login: "reviewer", type: "User" } }],
      });

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        github,
        payload: {
          pull_request: { node_id: "PR_1", user: { login: "author" } },
        },
      });

      const result = await runRule(prDraftOnChangesRequested, context);
      const reviewRequest = result?.effects.find((e) => e.type === "requestReviewers");
      expect(reviewRequest).toMatchObject({ reviewers: ["reviewer"] });
    });

    it("emits dismissReview for stale bot reviews", async () => {
      const github = createMockGitHub();
      github.paginate.mockResolvedValue([
        { id: 1, body: "<!-- ReviewDrafterComment -->\nSome message" },
      ]);
      github.pulls.listReviews.mockResolvedValue({
        data: [{ id: 20, state: "CHANGES_REQUESTED", user: { login: "some-bot", type: "Bot" } }],
      });

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        github,
        payload: {
          pull_request: { node_id: "PR_1", user: { login: "author" } },
        },
      });

      const result = await runRule(prDraftOnChangesRequested, context);
      const dismiss = result?.effects.find((e) => e.type === "dismissReview");
      expect(dismiss).toMatchObject({ review_id: 20, message: "Stale" });
    });
  });

  it("listens to review submitted and ready-for-review events", () => {
    expect(Object.keys(prDraftOnChangesRequested.events)).toContain(
      EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    );
    expect(Object.keys(prDraftOnChangesRequested.events)).toContain(
      EventType.PULL_REQUEST_READY_FOR_REVIEW,
    );
  });
});
