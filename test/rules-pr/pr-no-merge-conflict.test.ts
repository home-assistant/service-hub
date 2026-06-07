import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prNoMergeConflict } from "../../src/rules-pr/pr-no-merge-conflict.js";
import { createMockContext, createMockGitHub, runRule } from "../helpers/mock-context.js";

describe("pr-no-merge-conflict", () => {
  it("emits a fail dashboard row when the PR has merge conflicts", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({ data: { mergeable_state: "dirty" } });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    const result = await runRule(prNoMergeConflict, context);
    expect(result?.dashboard).toMatchObject({
      id: "merge-conflict",
      status: "fail",
    });
  });

  it("emits a pass dashboard row when the PR is clean", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({ data: { mergeable_state: "clean" } });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    const result = await runRule(prNoMergeConflict, context);
    expect(result?.dashboard).toMatchObject({
      id: "merge-conflict",
      status: "pass",
    });
  });

  it("returns nothing while mergeable_state is unknown", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({ data: { mergeable_state: "unknown" } });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      github,
    });

    const result = await runRule(prNoMergeConflict, context);
    expect(result).toBeUndefined();
  });

  it("listens to opened/reopened/synchronize", () => {
    const keys = Object.keys(prNoMergeConflict.events);
    expect(keys).toContain(EventType.PULL_REQUEST_OPENED);
    expect(keys).toContain(EventType.PULL_REQUEST_REOPENED);
    expect(keys).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
  });
});
