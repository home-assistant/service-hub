import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import {
  DRAFT_ON_CHANGES_REQUESTED_MARKER,
  draftOnChangesRequested,
} from "../../../src/github/rules/draft-on-changes-requested.js";
import { createMockContext, createMockGitHub, runRule } from "../helpers/mock-context.js";

function reviewContext(opts: {
  reviewState?: string;
  reviewerType?: "User" | "Bot";
  draft?: boolean;
  existingComments?: { body: string }[];
  member?: boolean;
}) {
  const github = createMockGitHub();
  github.issues.listComments.mockResolvedValue({ data: opts.existingComments ?? [] });
  if (opts.member === false) {
    github.orgs.checkMembershipForUser.mockRejectedValue({ status: 404 });
  }

  const context = createMockContext({
    eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    github,
    payload: {
      action: "submitted",
      sender: { login: "reviewer", type: opts.reviewerType ?? "User" },
      review: {
        state: opts.reviewState ?? "changes_requested",
        user: { login: "reviewer", type: opts.reviewerType ?? "User" },
      },
      pull_request: { draft: opts.draft ?? false },
    },
  });
  return context;
}

describe("draft-on-changes-requested", () => {
  it("drafts and explains when an org member requests changes", async () => {
    const result = await runRule(draftOnChangesRequested, reviewContext({}));
    expect(result?.effects).toContainEqual({ type: "convertToDraft" });
    expect(result?.comment).toContain(DRAFT_ON_CHANGES_REQUESTED_MARKER);
    expect(result?.comment).toContain("developers.home-assistant.io");
  });

  it("drafts on a bot review without checking membership", async () => {
    const result = await runRule(
      draftOnChangesRequested,
      reviewContext({ reviewerType: "Bot", member: false }),
    );
    expect(result?.effects).toContainEqual({ type: "convertToDraft" });
  });

  it("ignores reviews from non-members", async () => {
    const result = await runRule(draftOnChangesRequested, reviewContext({ member: false }));
    expect(result).toBeUndefined();
  });

  it("ignores approvals and comment reviews", async () => {
    expect(
      await runRule(draftOnChangesRequested, reviewContext({ reviewState: "approved" })),
    ).toBeUndefined();
    expect(
      await runRule(draftOnChangesRequested, reviewContext({ reviewState: "commented" })),
    ).toBeUndefined();
  });

  it("does nothing when the PR is already a draft", async () => {
    const result = await runRule(draftOnChangesRequested, reviewContext({ draft: true }));
    expect(result).toBeUndefined();
  });

  it("does not repeat the comment once the marker is present", async () => {
    const result = await runRule(
      draftOnChangesRequested,
      reviewContext({
        existingComments: [{ body: `${DRAFT_ON_CHANGES_REQUESTED_MARKER}\nolder comment` }],
      }),
    );
    expect(result?.effects).toEqual([{ type: "convertToDraft" }]);
  });

  it("recognizes the legacy bot's marker too", async () => {
    const result = await runRule(
      draftOnChangesRequested,
      reviewContext({
        existingComments: [{ body: "<!-- ReviewDrafterComment -->\nlegacy comment" }],
      }),
    );
    expect(result?.effects).toEqual([{ type: "convertToDraft" }]);
  });
});
