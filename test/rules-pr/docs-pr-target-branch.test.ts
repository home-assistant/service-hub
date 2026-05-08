import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { docsPrTargetBranch } from "../../src/rules-pr/docs-pr-target-branch.js";
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

describe("docs-pr-target-branch", () => {
  it("passes when standalone docs PR targets current", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "current" },
        body: "Fixed a typo in the docs",
        labels: [],
        assignees: [],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrTargetBranch.handle(context);
    expect(result).toBeUndefined();
  });

  it("warns when standalone docs PR targets next", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "next" },
        body: "Fixed a typo in the docs",
        labels: [],
        assignees: [],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrTargetBranch.handle(context);
    expect(result?.labels).toContain("needs-rebase");
    expect(result?.labels).toContain("in-progress");
    expect(result?.comment).toContain("target the `current` branch");
  });

  it("passes when docs PR with code parent targets next", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "next" },
        body: "Parent: home-assistant/core#1234",
        labels: [],
        assignees: [],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrTargetBranch.handle(context);
    expect(result).toBeUndefined();
  });

  it("warns when docs PR with code parent targets current", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "current" },
        body: "Parent: home-assistant/core#1234",
        labels: [],
        assignees: [],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrTargetBranch.handle(context);
    expect(result?.labels).toContain("needs-rebase");
    expect(result?.comment).toContain("target the `next` branch");
  });

  it("skips 'new' branch", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "new" },
        body: "",
        labels: [],
        assignees: [],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrTargetBranch.handle(context);
    expect(result).toBeUndefined();
  });

  it("does not re-warn if needs-rebase is already applied", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "next" },
        body: "Just a typo fix",
        labels: [{ name: "needs-rebase" }],
        assignees: [],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrTargetBranch.handle(context);
    expect(result).toBeUndefined();
  });

  it("removes needs-rebase when branch is corrected", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "current" },
        body: "Just a typo fix",
        labels: [{ name: "needs-rebase" }],
        assignees: [],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrTargetBranch.handle(context);
    expect(result).toMatchObject({ removeLabels: ["needs-rebase"] });
  });

  it("ignores links to ignored repos (brands)", async () => {
    const context = docsContext({
      pull_request: {
        base: { ref: "current" },
        body: "Related: home-assistant/brands#100",
        labels: [],
        assignees: [],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrTargetBranch.handle(context);
    // brands is in IGNORE_REPOS, so this is treated as no parent
    expect(result).toBeUndefined();
  });

  it("assigns the sender when warning", async () => {
    const context = docsContext({
      sender: { login: "contributor", type: "User" },
      pull_request: {
        base: { ref: "next" },
        body: "Just docs",
        labels: [],
        assignees: [],
        head: { sha: "abc123" },
      },
    });

    const result = await docsPrTargetBranch.handle(context);
    expect(result?.assignees).toContain("contributor");
  });
});
