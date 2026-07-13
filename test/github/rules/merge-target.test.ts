import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { mergeTarget } from "../../../src/github/rules/merge-target.js";
import { createMockContext, runRule } from "../helpers/mock-context.js";

function contextTargeting(baseRef: string, authorAssociation = "NONE") {
  return createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: {
      pull_request: {
        body: "",
        base: { ref: baseRef },
        head: { sha: "abc123" },
        user: { login: "contributor" },
        author_association: authorAssociation,
      },
    },
  });
}

describe("merge-target", () => {
  it("passes when the PR targets `dev`", async () => {
    const result = await runRule(mergeTarget, contextTargeting("dev"));
    expect(result?.section?.id).toBe("merge-target");
    expect(result?.section?.status).toBe("pass");
    expect(result?.section?.message).toContain("`dev`");
  });

  it("fails when a non-member targets `master`", async () => {
    const result = await runRule(mergeTarget, contextTargeting("master", "NONE"));
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`master`");
    expect(result?.section?.message).toContain("`dev`");
  });

  it("fails when a non-member targets `rc`", async () => {
    const result = await runRule(mergeTarget, contextTargeting("rc", "CONTRIBUTOR"));
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`rc`");
  });

  it("fails when a non-member targets an arbitrary branch", async () => {
    const result = await runRule(mergeTarget, contextTargeting("some-feature-branch"));
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`some-feature-branch`");
  });

  it("downgrades to warn when an org MEMBER targets a non-dev branch", async () => {
    const result = await runRule(mergeTarget, contextTargeting("master", "MEMBER"));
    expect(result?.section?.status).toBe("warn");
    expect(result?.section?.message).toContain("release branch");
  });

  it("downgrades to warn for OWNER and COLLABORATOR too", async () => {
    const owner = await runRule(mergeTarget, contextTargeting("rc", "OWNER"));
    expect(owner?.section?.status).toBe("warn");

    const collab = await runRule(mergeTarget, contextTargeting("rc", "COLLABORATOR"));
    expect(collab?.section?.status).toBe("warn");
  });

  it("does not emit any labels", async () => {
    const result = await runRule(mergeTarget, contextTargeting("master"));
    expect(result?.labels).toBeUndefined();
  });
});
