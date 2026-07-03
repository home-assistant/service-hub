import { describe, expect, it } from "bun:test";
import { mergeTarget } from "../../src/checks/merge-target.js";
import { EventType } from "../../src/engine/event.js";
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
    expect(result?.dashboard?.id).toBe("merge-target");
    expect(result?.dashboard?.status).toBe("pass");
    expect(result?.dashboard?.message).toContain("`dev`");
  });

  it("fails when a non-member targets `master`", async () => {
    const result = await runRule(mergeTarget, contextTargeting("master", "NONE"));
    expect(result?.dashboard?.status).toBe("fail");
    expect(result?.dashboard?.message).toContain("`master`");
    expect(result?.dashboard?.message).toContain("`dev`");
  });

  it("fails when a non-member targets `rc`", async () => {
    const result = await runRule(mergeTarget, contextTargeting("rc", "CONTRIBUTOR"));
    expect(result?.dashboard?.status).toBe("fail");
    expect(result?.dashboard?.message).toContain("`rc`");
  });

  it("fails when a non-member targets an arbitrary branch", async () => {
    const result = await runRule(mergeTarget, contextTargeting("some-feature-branch"));
    expect(result?.dashboard?.status).toBe("fail");
    expect(result?.dashboard?.message).toContain("`some-feature-branch`");
  });

  it("downgrades to info when an org MEMBER targets a non-dev branch", async () => {
    const result = await runRule(mergeTarget, contextTargeting("master", "MEMBER"));
    expect(result?.dashboard?.status).toBe("info");
    expect(result?.dashboard?.message).toContain("release branch");
  });

  it("downgrades to info for OWNER and COLLABORATOR too", async () => {
    const owner = await runRule(mergeTarget, contextTargeting("rc", "OWNER"));
    expect(owner?.dashboard?.status).toBe("info");

    const collab = await runRule(mergeTarget, contextTargeting("rc", "COLLABORATOR"));
    expect(collab?.dashboard?.status).toBe("info");
  });

  it("does not emit any labels", async () => {
    const result = await runRule(mergeTarget, contextTargeting("master"));
    expect(result?.labels).toBeUndefined();
  });
});
