import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { DRAFT_ON_CHANGES_REQUESTED_MARKER } from "../../../src/github/rules/draft-on-changes-requested.js";
import { readyForReview } from "../../../src/github/rules/ready-for-review.js";
import { createMockContext, createMockGitHub, runRule } from "../helpers/mock-context.js";

interface MockReview {
  id: number;
  state: string;
  user: { login: string; type: "User" | "Bot" };
}

function readyContext(opts: { hasMarker?: boolean; markerBody?: string; reviews?: MockReview[] }) {
  const github = createMockGitHub();
  const markerBody = opts.markerBody ?? `${DRAFT_ON_CHANGES_REQUESTED_MARKER}\ncomment`;
  github.issues.listComments.mockResolvedValue({
    data: opts.hasMarker === false ? [] : [{ body: markerBody }],
  });
  github.pulls.listReviews.mockResolvedValue({ data: opts.reviews ?? [] });

  return createMockContext({
    eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
    github,
    payload: { action: "ready_for_review" },
  });
}

describe("ready-for-review", () => {
  it("does nothing on PRs draft-on-changes-requested never drafted", async () => {
    const result = await runRule(
      readyForReview,
      readyContext({
        hasMarker: false,
        reviews: [{ id: 1, state: "CHANGES_REQUESTED", user: { login: "alice", type: "User" } }],
      }),
    );
    expect(result).toBeUndefined();
  });

  it("also honors the legacy bot's marker", async () => {
    const result = await runRule(
      readyForReview,
      readyContext({
        markerBody: "<!-- ReviewDrafterComment -->\nlegacy comment",
        reviews: [{ id: 1, state: "CHANGES_REQUESTED", user: { login: "alice", type: "User" } }],
      }),
    );
    expect(result?.effects).toEqual([{ type: "requestReviewers", reviewers: ["alice"] }]);
  });

  it("re-requests reviewers whose latest review requested changes", async () => {
    const result = await runRule(
      readyForReview,
      readyContext({
        reviews: [
          { id: 1, state: "CHANGES_REQUESTED", user: { login: "alice", type: "User" } },
          { id: 2, state: "CHANGES_REQUESTED", user: { login: "bob", type: "User" } },
        ],
      }),
    );
    expect(result?.effects).toContainEqual({ type: "requestReviewers", reviewers: ["alice"] });
    expect(result?.effects).toContainEqual({ type: "requestReviewers", reviewers: ["bob"] });
  });

  it("skips reviewers whose changes-requested was superseded by an approval", async () => {
    const result = await runRule(
      readyForReview,
      readyContext({
        reviews: [
          { id: 1, state: "CHANGES_REQUESTED", user: { login: "alice", type: "User" } },
          { id: 2, state: "APPROVED", user: { login: "alice", type: "User" } },
        ],
      }),
    );
    expect(result).toBeUndefined();
  });

  it("dismisses stale bot changes-requested reviews instead of re-requesting", async () => {
    const result = await runRule(
      readyForReview,
      readyContext({
        reviews: [{ id: 7, state: "CHANGES_REQUESTED", user: { login: "some-bot", type: "Bot" } }],
      }),
    );
    expect(result?.effects).toEqual([{ type: "dismissReview", reviewId: 7, message: "Stale" }]);
  });

  it("does nothing when no review is outstanding", async () => {
    const result = await runRule(
      readyForReview,
      readyContext({
        reviews: [{ id: 1, state: "APPROVED", user: { login: "alice", type: "User" } }],
      }),
    );
    expect(result).toBeUndefined();
  });
});
