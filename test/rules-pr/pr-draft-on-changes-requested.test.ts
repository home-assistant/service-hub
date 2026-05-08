import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prDraftOnChangesRequested } from "../../src/rules-pr/pr-draft-on-changes-requested.js";
import { createMockContext, createMockGitHub } from "../helpers/mock-context.js";

describe("pr-draft-on-changes-requested", () => {
  it("returns an action for review submitted events", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
      payload: {
        review: { user: { login: "reviewer" }, state: "changes_requested" },
        pull_request: { draft: false, node_id: "PR_1", user: { login: "author" } },
      },
    });

    const result = await prDraftOnChangesRequested.handle(context);
    expect(result?.actions).toHaveLength(1);
  });

  it("returns an action for ready-for-review events", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
      payload: {
        pull_request: { node_id: "PR_1", user: { login: "author" } },
      },
    });

    const result = await prDraftOnChangesRequested.handle(context);
    expect(result?.actions).toHaveLength(1);
  });

  describe("review submitted action", () => {
    it("converts PR to draft on changes_requested from org member", async () => {
      const github = createMockGitHub();
      (github.paginate as any).mockResolvedValue([]);
      (github.orgs as any).getMembershipForUser.mockResolvedValue({
        data: { role: "member" },
      });

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        github,
        payload: {
          review: { user: { login: "reviewer" }, state: "changes_requested" },
          pull_request: { draft: false, node_id: "PR_1", user: { login: "author" } },
          sender: { login: "reviewer", type: "User" },
        },
      });

      const result = await prDraftOnChangesRequested.handle(context);
      await result!.actions![0](context);

      expect(github.graphql).toHaveBeenCalledWith(
        expect.stringContaining("convertPullRequestToDraft"),
        expect.objectContaining({ id: "PR_1" }),
      );
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

      const result = await prDraftOnChangesRequested.handle(context);
      await result!.actions![0](context);

      expect(github.graphql).not.toHaveBeenCalled();
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

      const result = await prDraftOnChangesRequested.handle(context);
      await result!.actions![0](context);

      expect(github.graphql).not.toHaveBeenCalled();
    });

    it("does nothing for non-org-member reviewers", async () => {
      const github = createMockGitHub();
      (github.orgs as any).getMembershipForUser.mockRejectedValue(new Error("Not a member"));

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        github,
        payload: {
          review: { user: { login: "external-user" }, state: "changes_requested" },
          pull_request: { draft: false, node_id: "PR_1", user: { login: "author" } },
          sender: { login: "external-user", type: "User" },
        },
      });

      const result = await prDraftOnChangesRequested.handle(context);
      await result!.actions![0](context);

      expect(github.graphql).not.toHaveBeenCalled();
    });
  });

  describe("ready for review action", () => {
    it("re-requests reviews from human reviewers", async () => {
      const github = createMockGitHub();
      (github.paginate as any).mockResolvedValue([
        { id: 1, body: "<!-- ReviewDrafterComment -->\nSome message" },
      ]);
      (github.pulls.listReviews as any).mockResolvedValue({
        data: [
          {
            id: 10,
            state: "CHANGES_REQUESTED",
            user: { login: "reviewer", type: "User" },
          },
        ],
      });

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        github,
        payload: {
          pull_request: { node_id: "PR_1", user: { login: "author" } },
        },
      });

      const result = await prDraftOnChangesRequested.handle(context);
      await result!.actions![0](context);

      expect(github.pulls.requestReviewers).toHaveBeenCalledWith(
        expect.objectContaining({ reviewers: ["reviewer"] }),
      );
    });

    it("dismisses stale bot reviews", async () => {
      const github = createMockGitHub();
      (github.paginate as any).mockResolvedValue([
        { id: 1, body: "<!-- ReviewDrafterComment -->\nSome message" },
      ]);
      (github.pulls.listReviews as any).mockResolvedValue({
        data: [
          {
            id: 20,
            state: "CHANGES_REQUESTED",
            user: { login: "some-bot", type: "Bot" },
          },
        ],
      });

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        github,
        payload: {
          pull_request: { node_id: "PR_1", user: { login: "author" } },
        },
      });

      const result = await prDraftOnChangesRequested.handle(context);
      await result!.actions![0](context);

      expect(github.pulls.dismissReview).toHaveBeenCalledWith(
        expect.objectContaining({ review_id: 20, message: "Stale" }),
      );
    });
  });

  it("listens to review submitted and ready-for-review events", () => {
    expect(prDraftOnChangesRequested.listens).toContain(
      EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    );
    expect(prDraftOnChangesRequested.listens).toContain(
      EventType.PULL_REQUEST_READY_FOR_REVIEW,
    );
  });
});
