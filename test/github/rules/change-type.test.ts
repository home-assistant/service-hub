import { describe, expect, it } from "bun:test";
import { EventType } from "../../../src/github/engine/event.js";
import { changeType } from "../../../src/github/rules/change-type.js";
import { createMockContext, mockPRFiles, runRule } from "../helpers/mock-context.js";

function makeFile(filename: string, overrides: { status?: string; additions?: number } = {}) {
  return {
    filename,
    status: overrides.status ?? "modified",
    additions: overrides.additions ?? 10,
    deletions: 0,
    changes: overrides.additions ?? 10,
    sha: "abc",
    blob_url: "",
    raw_url: "",
    contents_url: "",
  };
}

describe("change-type", () => {
  describe("type of change from body", () => {
    it("adds bugfix label from a single checked task", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "- [x] Bugfix (non-breaking change which fixes an issue)",
            base: { ref: "dev" },
            head: { sha: "abc123" },
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(changeType, context);
      expect(result?.labels).toContain("bugfix");
    });

    it("adds all picked labels when multiple boxes are checked", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: [
              "- [x] Bugfix (non-breaking change which fixes an issue)",
              "- [x] Breaking change (fix/feature causing existing functionality to break)",
            ].join("\n"),
            base: { ref: "dev" },
            head: { sha: "abc123" },
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(changeType, context);
      expect(result?.labels).toEqual(expect.arrayContaining(["bugfix", "breaking-change"]));
    });

    it("does not add label for unchecked tasks", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "- [ ] Bugfix (non-breaking change which fixes an issue)",
            base: { ref: "dev" },
            head: { sha: "abc123" },
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(changeType, context);
      expect(result?.labels ?? []).not.toContain("bugfix");
    });

    it("removes stale type-of-change labels when a different box is now checked", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_EDITED,
        payload: {
          pull_request: {
            body: "- [x] Breaking change (fix/feature causing existing functionality to break)",
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [{ name: "bugfix" }, { name: "small-pr" }],
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(changeType, context);
      expect(result?.labels).toContain("breaking-change");
      expect(result?.removeLabels).toContain("bugfix");
      // small-pr is NOT a type-of-change label and should be left alone
      expect(result?.removeLabels ?? []).not.toContain("small-pr");
    });

    it("removes labels not in the picked set even when multiple boxes are checked", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_EDITED,
        payload: {
          pull_request: {
            body: [
              "- [x] Bugfix (non-breaking change which fixes an issue)",
              "- [x] Breaking change (fix/feature causing existing functionality to break)",
            ].join("\n"),
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [{ name: "deprecation" }],
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(changeType, context);
      expect(result?.removeLabels).toContain("deprecation");
    });

    it("does not add any type-of-change label when no box is checked", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "## Proposed change\nSome description but no type checked.",
            base: { ref: "dev" },
            head: { sha: "abc123" },
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(changeType, context);
      for (const label of [
        "bugfix",
        "dependency",
        "new-feature",
        "new-integration",
        "deprecation",
        "breaking-change",
        "code-quality",
      ]) {
        expect(result?.labels ?? []).not.toContain(label);
      }
    });

    it("removes all stale type-of-change labels when no box is checked", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_EDITED,
        payload: {
          pull_request: {
            body: "## Proposed change\nAuthor unchecked everything.",
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [{ name: "bugfix" }, { name: "breaking-change" }, { name: "small-pr" }],
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(changeType, context);
      expect(result?.removeLabels).toEqual(expect.arrayContaining(["bugfix", "breaking-change"]));
      expect(result?.removeLabels ?? []).not.toContain("small-pr");
    });
  });

  describe("dashboard row messaging", () => {
    it("fails with 'check at least one' when no Type of change box is checked", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "## Proposed change\nNo type box checked.",
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [],
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(changeType, context);
      expect(result?.dashboard?.status).toBe("fail");
      expect(result?.dashboard?.message).toMatch(/check at least one/i);
    });

    it("passes with the picked label when exactly one box is checked", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "- [x] Bugfix (non-breaking change which fixes an issue)",
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [],
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(changeType, context);
      expect(result?.dashboard?.status).toBe("pass");
      expect(result?.dashboard?.message).toContain("bugfix");
    });

    it("passes with all picked labels when multiple boxes are checked", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: [
              "- [x] Bugfix (non-breaking change which fixes an issue)",
              "- [x] Breaking change (fix/feature causing existing functionality to break)",
            ].join("\n"),
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [],
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(changeType, context);
      expect(result?.dashboard?.status).toBe("pass");
      expect(result?.dashboard?.message).toContain("bugfix");
      expect(result?.dashboard?.message).toContain("breaking-change");
    });
  });

  describe("new-integration consistency check", () => {
    it("fails the dashboard row when a non-new-integration box is checked but files add an integration", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "- [x] Bugfix (non-breaking change which fixes an issue)",
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [],
          },
        },
      });
      mockPRFiles(context, [
        makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
      ]);

      const result = await runRule(changeType, context);
      expect(result?.dashboard?.status).toBe("fail");
      expect(result?.dashboard?.message).toMatch(/adds a new integration/i);
      expect(result?.dashboard?.message).toContain("bugfix");
      // The body label still gets applied — body remains the source of truth.
      expect(result?.labels).toContain("bugfix");
    });

    it("fails the dashboard row when New integration is checked but no integration is added", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "- [x] New integration (thank you!)",
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [],
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(changeType, context);
      expect(result?.dashboard?.status).toBe("fail");
      expect(result?.dashboard?.message).toMatch(/no new integration directory/i);
    });

    it("passes when New integration is checked and an integration is added", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "- [x] New integration (thank you!)",
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [],
          },
        },
      });
      mockPRFiles(context, [
        makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
      ]);

      const result = await runRule(changeType, context);
      expect(result?.dashboard?.status).toBe("pass");
      expect(result?.labels).toContain("new-integration");
    });

    it("fails when New integration is among multiple picked but no integration is added", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: [
              "- [x] New integration (thank you!)",
              "- [x] Bugfix (non-breaking change which fixes an issue)",
            ].join("\n"),
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [],
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(changeType, context);
      expect(result?.dashboard?.status).toBe("fail");
      expect(result?.dashboard?.message).toMatch(/no new integration directory/i);
      // Labels still reflect what the body says.
      expect(result?.labels).toEqual(expect.arrayContaining(["new-integration", "bugfix"]));
    });

    it("fails when multiple boxes are picked without New integration but files add one", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: [
              "- [x] Bugfix (non-breaking change which fixes an issue)",
              "- [x] Breaking change (fix/feature causing existing functionality to break)",
            ].join("\n"),
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [],
          },
        },
      });
      mockPRFiles(context, [
        makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
      ]);

      const result = await runRule(changeType, context);
      expect(result?.dashboard?.status).toBe("fail");
      expect(result?.dashboard?.message).toMatch(/adds a new integration/i);
      expect(result?.dashboard?.message).toContain("bugfix");
      expect(result?.dashboard?.message).toContain("breaking-change");
    });

    it("passes when New integration plus another box are checked and an integration is added", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: [
              "- [x] New integration (thank you!)",
              "- [x] Breaking change (fix/feature causing existing functionality to break)",
            ].join("\n"),
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [],
          },
        },
      });
      mockPRFiles(context, [
        makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
      ]);

      const result = await runRule(changeType, context);
      expect(result?.dashboard?.status).toBe("pass");
      expect(result?.labels).toEqual(
        expect.arrayContaining(["new-integration", "breaking-change"]),
      );
    });
  });

  it("is excluded from bot senders by the dispatcher", () => {
    expect(changeType.allowBots).toBe(false);
  });

  it("also runs on pull_request.edited", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_EDITED,
      payload: {
        pull_request: {
          body: "- [x] Bugfix (non-breaking change which fixes an issue)",
          base: { ref: "dev" },
          head: { sha: "abc123" },
          labels: [],
        },
      },
    });
    mockPRFiles(context, [makeFile("homeassistant/components/random/__init__.py")]);
    const result = await runRule(changeType, context);
    expect(result?.labels).toContain("bugfix");
  });

  it("also runs on pull_request.synchronize", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      payload: {
        pull_request: {
          body: "- [x] Bugfix (non-breaking change which fixes an issue)",
          base: { ref: "dev" },
          head: { sha: "abc123" },
          labels: [],
        },
      },
    });
    mockPRFiles(context, [makeFile("homeassistant/components/random/__init__.py")]);
    const result = await runRule(changeType, context);
    expect(result?.labels).toContain("bugfix");
  });
});
