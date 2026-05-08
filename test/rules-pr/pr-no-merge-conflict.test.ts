import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prNoMergeConflict } from "../../src/rules-pr/pr-no-merge-conflict.js";
import { createMockContext, createMockGitHub } from "../helpers/mock-context.js";

describe("pr-no-merge-conflict", () => {
  it("requests changes when PR has merge conflict", async () => {
    const github = createMockGitHub();
    (github.pulls.get as any).mockResolvedValue({
      data: { mergeable_state: "dirty" },
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    const result = await prNoMergeConflict.handle(context);
    expect(result).toMatchObject({ requestChanges: "There is a merge conflict." });
  });

  it("returns undefined when PR is clean", async () => {
    const github = createMockGitHub();
    (github.pulls.get as any).mockResolvedValue({
      data: { mergeable_state: "clean" },
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    const result = await prNoMergeConflict.handle(context);
    expect(result).toBeUndefined();
  });

  it("returns undefined when mergeable state is unstable", async () => {
    const github = createMockGitHub();
    (github.pulls.get as any).mockResolvedValue({
      data: { mergeable_state: "unstable" },
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      github,
    });

    const result = await prNoMergeConflict.handle(context);
    expect(result).toBeUndefined();
  });

  it("listens to opened and synchronize events", () => {
    expect(prNoMergeConflict.listens).toContain(EventType.PULL_REQUEST_OPENED);
    expect(prNoMergeConflict.listens).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
  });
});
