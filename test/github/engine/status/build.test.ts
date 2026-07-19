import { describe, expect, it } from "vitest";
import {
  buildStatus,
  hasFailingSections,
  type StatusInput,
} from "../../../../src/github/engine/status/build.js";
import { renderStatus } from "../../../../src/github/engine/status/render.js";
import type { StatusSection } from "../../../../src/github/engine/status/types.js";

const REPO = "home-assistant/core";

function input(overrides: Partial<StatusInput> = {}): StatusInput {
  return {
    target: { kind: "pull_request", repoFullName: REPO },
    newSections: [],
    overrides: [],
    previousBody: null,
    knownSectionIds: new Set(["a", "b", "merge-conflict"]),
    help: { commandSlug: "ha-bot", commands: [] },
    ...overrides,
  };
}

function section(partial: Partial<StatusSection> & { id: string }): StatusSection {
  return { title: partial.id, status: "pass", message: "ok", ...partial };
}

function previousBodyWith(sections: StatusSection[]): string {
  return renderStatus(sections, REPO);
}

describe("buildStatus", () => {
  it("returns a null body when no comment exists and nothing survives", () => {
    const result = buildStatus(input());
    expect(result.body).toBeNull();
    expect(result.sections).toEqual([]);
  });

  it("returns a null body for overrides without an existing comment", () => {
    const result = buildStatus(input({ overrides: [{ id: "a", ignore: { reason: "r" } }] }));
    expect(result.body).toBeNull();
  });

  it("renders new sections into a body when no comment exists", () => {
    const result = buildStatus(input({ newSections: [section({ id: "a" })] }));
    expect(result.body).toContain("## Checks");
    expect(result.sections).toEqual([section({ id: "a" })]);
  });

  it("merges new sections over persisted ones by id, new data winning", () => {
    const previous = previousBodyWith([
      section({ id: "a", status: "fail", message: "old" }),
      section({ id: "b" }),
    ]);
    const result = buildStatus(
      input({
        previousBody: previous,
        newSections: [section({ id: "a", status: "pass", message: "fixed" })],
      }),
    );
    expect(result.sections).toEqual([
      section({ id: "a", status: "pass", message: "fixed" }),
      section({ id: "b" }),
    ]);
  });

  it("sweeps persisted sections no live rule claims", () => {
    const previous = previousBodyWith([section({ id: "gone-rule" }), section({ id: "b" })]);
    const result = buildStatus(input({ previousBody: previous }));
    expect(result.sections).toEqual([section({ id: "b" })]);
    expect(result.body).not.toContain("gone-rule");
  });

  describe("waivers", () => {
    const failing = section({
      id: "merge-conflict",
      title: "Merge conflicts",
      status: "fail",
      message: "Branch has merge conflicts.",
    });

    it("an ignore override sets the waiver and flips the aggregate", () => {
      const result = buildStatus(
        input({
          previousBody: previousBodyWith([failing]),
          overrides: [{ id: "merge-conflict", ignore: { reason: "Will rebase" } }],
        }),
      );
      expect(result.sections).toEqual([{ ...failing, ignored: { reason: "Will rebase" } }]);
      expect(result.aggregate).toEqual({
        state: "success",
        description: "All checks passed (1 warning)",
        shouldDraft: false,
      });
      expect(result.body).toContain("Ignored: Will rebase");
    });

    it("an unignore override clears the waiver", () => {
      const previous = previousBodyWith([{ ...failing, ignored: { reason: "Will rebase" } }]);
      const result = buildStatus(
        input({ previousBody: previous, overrides: [{ id: "merge-conflict", ignore: null }] }),
      );
      expect(result.sections).toEqual([failing]);
      expect(result.aggregate.state).toBe("failure");
      expect(result.aggregate.shouldDraft).toBe(true);
    });

    it("a waiver survives the owning rule re-emitting its section", () => {
      const previous = previousBodyWith([{ ...failing, ignored: { reason: "Will rebase" } }]);
      const result = buildStatus(
        input({
          previousBody: previous,
          newSections: [{ ...failing, message: "Still conflicting." }],
        }),
      );
      expect(result.sections).toEqual([
        { ...failing, message: "Still conflicting.", ignored: { reason: "Will rebase" } },
      ]);
      expect(result.aggregate.state).toBe("success");
    });

    it("overrides for unknown section ids are ignored", () => {
      const result = buildStatus(
        input({
          previousBody: previousBodyWith([failing]),
          overrides: [{ id: "typo-id", ignore: { reason: "nope" } }],
        }),
      );
      expect(result.sections).toEqual([failing]);
      expect(result.aggregate.state).toBe("failure");
    });

    it("a waived pending section counts as a warning, not pending", () => {
      const pending = section({ id: "a", status: "pending", message: "wait" });
      const result = buildStatus(
        input({
          previousBody: previousBodyWith([pending]),
          overrides: [{ id: "a", ignore: { reason: "known transient" } }],
        }),
      );
      expect(result.aggregate).toEqual({
        state: "success",
        description: "All checks passed (1 warning)",
        shouldDraft: false,
      });
    });

    it("does not waive other failing sections", () => {
      const result = buildStatus(
        input({
          previousBody: previousBodyWith([failing, section({ id: "b", status: "fail" })]),
          overrides: [{ id: "merge-conflict", ignore: { reason: "ok" } }],
        }),
      );
      expect(result.aggregate).toMatchObject({
        state: "failure",
        description: "1 check failing",
      });
    });
  });

  describe("aggregate", () => {
    it("fails and drafts when any section fails", () => {
      const result = buildStatus(
        input({ newSections: [section({ id: "a" }), section({ id: "b", status: "fail" })] }),
      );
      expect(result.aggregate).toEqual({
        state: "failure",
        description: "1 check failing",
        shouldDraft: true,
      });
    });

    it("fails without drafting when a section is pending", () => {
      const result = buildStatus(
        input({ newSections: [section({ id: "a" }), section({ id: "b", status: "pending" })] }),
      );
      expect(result.aggregate).toEqual({
        state: "failure",
        description: "1 check pending",
        shouldDraft: false,
      });
    });

    it("succeeds and notes skipped sections", () => {
      const result = buildStatus(
        input({
          newSections: [
            section({ id: "a" }),
            section({ id: "b", status: "skip" }),
            section({ id: "merge-conflict", status: "skip" }),
          ],
        }),
      );
      expect(result.aggregate).toEqual({
        state: "success",
        description: "All checks passed (2 skipped)",
        shouldDraft: false,
      });
    });

    it("succeeds plainly when everything passes", () => {
      const result = buildStatus(input({ newSections: [section({ id: "a" })] }));
      expect(result.aggregate).toEqual({
        state: "success",
        description: "All checks passed",
        shouldDraft: false,
      });
    });
  });
});

describe("hasFailingSections", () => {
  it("is true for a body carrying a failing section", () => {
    const body = previousBodyWith([section({ id: "a", status: "fail" })]);
    expect(hasFailingSections(body)).toBe(true);
  });

  it("is false for pending-only and passing bodies", () => {
    expect(hasFailingSections(previousBodyWith([section({ id: "a", status: "pending" })]))).toBe(
      false,
    );
    expect(hasFailingSections(previousBodyWith([section({ id: "a" })]))).toBe(false);
  });

  it("is false when the only failing section is waived", () => {
    const body = previousBodyWith([section({ id: "a", status: "fail", ignored: { reason: "r" } })]);
    expect(hasFailingSections(body)).toBe(false);
  });
});
