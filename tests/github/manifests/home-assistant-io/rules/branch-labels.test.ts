import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { branchLabels } from "../../../../../src/github/manifests/home-assistant-io/rules/branch-labels.js";
import { createMockContext, runRule } from "../../../helpers/mock-context.js";

function contextTargeting(baseRef: string) {
  return createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: { pull_request: { base: { ref: baseRef } } },
  });
}

describe("branch-labels", () => {
  it("labels a PR with its docs target branch", async () => {
    const result = await runRule(branchLabels, contextTargeting("current"));
    expect(result?.labels).toEqual(["current"]);
    expect(result?.removeLabels).toEqual(expect.arrayContaining(["rc", "next"]));
  });

  it("only removes branch labels when the target is not a docs branch", async () => {
    const result = await runRule(branchLabels, contextTargeting("some-branch"));
    expect(result?.labels).toBeUndefined();
    expect(result?.removeLabels).toEqual(expect.arrayContaining(["current", "rc", "next"]));
  });
});
