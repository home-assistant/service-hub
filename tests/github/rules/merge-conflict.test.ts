import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { mergeConflict } from "../../../src/github/rules/merge-conflict.js";
import { createMockContext, createMockGitHub, runRule } from "../helpers/mock-context.js";

describe("merge-conflict", () => {
  it("emits a fail dashboard row when the PR has merge conflicts", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({ data: { mergeable_state: "dirty" } });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    const result = await runRule(mergeConflict, context);
    expect(result?.section).toMatchObject({
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

    const result = await runRule(mergeConflict, context);
    expect(result?.section).toMatchObject({
      id: "merge-conflict",
      status: "pass",
    });
  });

  it("passes while mergeable_state is unknown so a stale fail can't persist", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({ data: { mergeable_state: "unknown" } });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      github,
    });

    const result = await runRule(mergeConflict, context);
    expect(result?.section?.status).toBe("pass");
  });

  it("listens to opened/reopened/synchronize", () => {
    const keys = Object.keys(mergeConflict.events);
    expect(keys).toContain(EventType.PULL_REQUEST_OPENED);
    expect(keys).toContain(EventType.PULL_REQUEST_REOPENED);
    expect(keys).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
  });
});
