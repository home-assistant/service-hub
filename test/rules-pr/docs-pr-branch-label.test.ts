import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { docsPrBranchLabel } from "../../src/rules-pr/docs-pr-branch-label.js";
import { createMockContext } from "../helpers/mock-context.js";

function docsContext(overrides: Record<string, unknown> = {}) {
  return createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: {
      repository: {
        full_name: "home-assistant/home-assistant.io",
        name: "home-assistant.io",
        owner: { login: "home-assistant" },
      },
      ...overrides,
    },
  });
}

describe("docs-pr-branch-label", () => {
  it("adds branch label matching target branch", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "current" },
        labels: [],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrBranchLabel.handle(context);
    expect(result).toMatchObject({ labels: ["current"] });
  });

  it("removes mismatched branch labels", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "next" },
        labels: [{ name: "current" }],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrBranchLabel.handle(context);
    expect(result).toMatchObject({
      labels: ["next"],
      removeLabels: ["current"],
    });
  });

  it("does nothing when correct label already applied", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "current" },
        labels: [{ name: "current" }],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrBranchLabel.handle(context);
    expect(result).toBeUndefined();
  });

  it("returns undefined for non-docs repos", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          base: { ref: "current" },
          labels: [],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await docsPrBranchLabel.handle(context);
    expect(result).toBeUndefined();
  });

  it("handles rc branch", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "rc" },
        labels: [],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrBranchLabel.handle(context);
    expect(result).toMatchObject({ labels: ["rc"] });
  });

  it("ignores non-branch labels when removing", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "current" },
        labels: [{ name: "bugfix" }, { name: "next" }],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrBranchLabel.handle(context);
    expect(result?.removeLabels).toEqual(["next"]);
    expect(result?.removeLabels).not.toContain("bugfix");
  });

  it("does not allow bots", () => {
    expect(docsPrBranchLabel.allowBots).toBe(false);
  });
});
