import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { docsTargetBranch } from "../../../../../src/github/manifests/home-assistant-io/rules/docs-target-branch.js";
import { createMockContext, runRule } from "../../../helpers/mock-context.js";

function docsContext(baseRef: string, body = "") {
  return createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: { pull_request: { base: { ref: baseRef }, body } },
  });
}

describe("docs-target-branch", () => {
  it("passes a standalone docs PR targeting current", async () => {
    const result = await runRule(docsTargetBranch, docsContext("current"));
    expect(result?.section?.status).toBe("pass");
  });

  it("warns a standalone docs PR targeting next", async () => {
    const result = await runRule(docsTargetBranch, docsContext("next"));
    expect(result?.section?.status).toBe("warn");
    expect(result?.section?.message).toContain("`current`");
  });

  it("passes a docs PR with a parent code PR targeting next", async () => {
    const result = await runRule(
      docsTargetBranch,
      docsContext("next", "Parent: home-assistant/core#12345"),
    );
    expect(result?.section?.status).toBe("pass");
  });

  it("warns a docs PR with a parent code PR targeting current", async () => {
    const result = await runRule(
      docsTargetBranch,
      docsContext("current", "Parent: https://github.com/home-assistant/frontend/pull/999"),
    );
    expect(result?.section?.status).toBe("warn");
    expect(result?.section?.message).toContain("`next`");
  });

  it("treats brands/developers/docs links as non-parents", async () => {
    const result = await runRule(
      docsTargetBranch,
      docsContext("current", "See home-assistant/brands#1 and home-assistant/home-assistant.io#2"),
    );
    expect(result?.section?.status).toBe("pass");
  });

  it("exempts the `new` branch", async () => {
    const result = await runRule(docsTargetBranch, docsContext("new"));
    expect(result?.section?.status).toBe("skip");
  });
});
