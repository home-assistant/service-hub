import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prNoMergeConflict } from "../../src/rules-pr/pr-no-merge-conflict.js";
import { createMockContext, createMockGitHub, runRule } from "../helpers/mock-context.js";

describe("pr-no-merge-conflict", () => {
  it("requests changes when PR has merge conflict", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({
      data: { mergeable_state: "dirty" },
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    const result = await runRule(prNoMergeConflict, context);
    expect(result).toMatchObject({ requestChanges: "There is a merge conflict." });
  });

  it("returns undefined when PR is clean", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({
      data: { mergeable_state: "clean" },
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    const result = await runRule(prNoMergeConflict, context);
    expect(result).toBeUndefined();
  });

  it("returns undefined when mergeable state is unstable", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({
      data: { mergeable_state: "unstable" },
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      github,
    });

    const result = await runRule(prNoMergeConflict, context);
    expect(result).toBeUndefined();
  });

  it("listens to opened and synchronize events", () => {
    expect(Object.keys(prNoMergeConflict.events)).toContain(EventType.PULL_REQUEST_OPENED);
    expect(Object.keys(prNoMergeConflict.events)).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
  });
});
