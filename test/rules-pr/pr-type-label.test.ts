import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../src/github/types.js";
import { PrTypeLabel as prAutoLabel } from "../../src/rules-pr/pr-type-label.js";
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

describe("pr-auto-label", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Mock analytics fetch to return empty data by default
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ integrations: {} }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("component and platform labels", () => {
    it("adds integration label for component files", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("integration: hue");
    });

    it("caps integration labels at 5", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/a/__init__.py"),
        makeFile("homeassistant/components/b/__init__.py"),
        makeFile("homeassistant/components/c/__init__.py"),
        makeFile("homeassistant/components/d/__init__.py"),
        makeFile("homeassistant/components/e/__init__.py"),
        makeFile("homeassistant/components/f/__init__.py"),
      ]);

      const result = await runRule(prAutoLabel, context);
      const integrationLabels = result?.labels?.filter((l) => l.startsWith("integration: "));
      expect(integrationLabels).toBeUndefined();
    });
  });

  describe("has-tests", () => {
    it("adds has-tests when test files are present", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py"),
        makeFile("tests/components/hue/test_init.py"),
      ]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("has-tests");
    });

    it("does not add has-tests when no test files", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).not.toContain("has-tests");
    });
  });

  describe("core label", () => {
    it("adds core label for core component files", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [makeFile("homeassistant/components/mqtt/__init__.py")]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("core");
    });

    it("adds core label for helper files", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [makeFile("homeassistant/helpers/entity.py")]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("core");
    });
  });

  describe("new-integration and new-platform", () => {
    it("adds new-integration when __init__.py is added", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
      ]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("new-integration");
    });

    it("adds new-platform when platform file is added", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/sensor.py", { status: "added" }),
      ]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("new-platform");
    });

    it("prefers new-integration over new-platform", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
        makeFile("homeassistant/components/newdevice/sensor.py", { status: "added" }),
      ]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("new-integration");
      expect(result?.labels).not.toContain("new-platform");
    });
  });

  describe("remove-platform", () => {
    it("adds remove-platform when platform file is removed", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/sensor.py", { status: "removed" }),
      ]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("remove-platform");
    });
  });

  describe("small-pr", () => {
    it("adds small-pr when additions are below threshold", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { additions: 5 }),
      ]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("small-pr");
    });

    it("does not add small-pr when additions are above threshold", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { additions: 50 }),
      ]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).not.toContain("small-pr");
    });

    it("excludes test files from small-pr threshold count", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { additions: 5 }),
        makeFile("tests/components/hue/test_init.py", { additions: 200 }),
      ]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("small-pr");
    });
  });

  describe("type of change from body", () => {
    it("adds bugfix label from checked task in PR body", async () => {
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

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("bugfix");
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

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).not.toContain("bugfix");
    });

    it("does nothing when multiple type-of-change boxes are checked", async () => {
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

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).not.toContain("bugfix");
      expect(result?.labels).not.toContain("breaking-change");
    });

    it("removes stale type-of-change labels when one box is now checked", async () => {
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

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("breaking-change");
      // bugfix is a stale type-of-change label and should be removed
      expect(result?.removeLabels).toContain("bugfix");
      // small-pr is NOT a type-of-change label and should be left alone
      expect(result?.removeLabels ?? []).not.toContain("small-pr");
    });

    it("does not remove labels when multiple type-of-change boxes are checked", async () => {
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

      const result = await runRule(prAutoLabel, context);
      expect(result?.removeLabels ?? []).not.toContain("deprecation");
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

      const result = await runRule(prAutoLabel, context);
      for (const label of [
        "bugfix",
        "dependency",
        "new-feature",
        "new-integration",
        "deprecation",
        "breaking-change",
        "code-quality",
      ]) {
        expect(result?.labels).not.toContain(label);
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

      const result = await runRule(prAutoLabel, context);
      expect(result?.removeLabels).toEqual(expect.arrayContaining(["bugfix", "breaking-change"]));
      // small-pr is not a type-of-change label, so it must stay.
      expect(result?.removeLabels ?? []).not.toContain("small-pr");
    });
  });

  describe("merge target warning", () => {
    it("adds merging-to-master for master target", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "",
            base: { ref: "master" },
            head: { sha: "abc123" },
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("merging-to-master");
    });

    it("adds merging-to-rc for rc target", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "",
            base: { ref: "rc" },
            head: { sha: "abc123" },
          },
        },
      });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("merging-to-rc");
    });
  });

  describe("metadata-only", () => {
    it("adds metadata-only when all files are metadata", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/manifest.json"),
        makeFile("CODEOWNERS"),
      ]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("metadata-only");
    });

    it("does not add metadata-only when non-metadata files present", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/manifest.json"),
        makeFile("homeassistant/components/hue/__init__.py"),
      ]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).not.toContain("metadata-only");
    });
  });

  describe("config-flow", () => {
    it("adds config-flow when config_flow.py is added without __init__.py", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/config_flow.py", { status: "added" }),
      ]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).toContain("config-flow");
    });

    it("does not add config-flow when __init__.py is also added (new integration)", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { status: "added" }),
        makeFile("homeassistant/components/hue/config_flow.py", { status: "added" }),
      ]);

      const result = await runRule(prAutoLabel, context);
      expect(result?.labels).not.toContain("config-flow");
    });
  });

  describe("top labels", () => {
    it("does not add top labels for core or new-integration", async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ integrations: { mqtt: 100000 } }),
      });

      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [makeFile("homeassistant/components/mqtt/__init__.py")]);

      const result = await runRule(prAutoLabel, context);
      // mqtt is a core component, so LABELS_PREVENT_TOP prevents top labels
      expect(result?.labels).not.toContain("Top 50");
    });
  });

  it("returns small-pr and metadata-only for empty file list", async () => {
    // 0 additions < 30 threshold, and [].every() is vacuously true
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, []);

    const result = await runRule(prAutoLabel, context);
    expect(result?.labels).toContain("small-pr");
    expect(result?.labels).toContain("metadata-only");
  });

  it("skips body/file auto-labeling for bot senders but still emits the dashboard row", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        sender: { login: "dependabot[bot]", type: "Bot" },
        pull_request: {
          body: "- [x] Bugfix (non-breaking change which fixes an issue)",
          base: { ref: "dev" },
          head: { sha: "abc123" },
          labels: [],
        },
      },
    });
    mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

    const result = await runRule(prAutoLabel, context);
    // No body-driven label added even though the checkbox is set
    expect(result?.labels ?? []).not.toContain("bugfix");
    expect(result?.labels ?? []).not.toContain("integration: hue");
    // Dashboard row still emitted so the synthesized ha-bot status reflects it.
    expect(result?.dashboard?.id).toBe("type-of-change");
  });

  describe("dashboard row messaging", () => {
    it("says 'please check one' when no Type of change box is checked", async () => {
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

      const result = await runRule(prAutoLabel, context);
      expect(result?.dashboard?.status).toBe("fail");
      expect(result?.dashboard?.message).toMatch(/Please check one/i);
    });

    it("says 'pick only one' when multiple Type of change boxes are checked", async () => {
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

      const result = await runRule(prAutoLabel, context);
      expect(result?.dashboard?.status).toBe("fail");
      expect(result?.dashboard?.message).toMatch(/pick only one/i);
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

      const result = await runRule(prAutoLabel, context);
      expect(result?.dashboard?.status).toBe("pass");
      expect(result?.dashboard?.message).toContain("bugfix");
    });
  });

  it("also runs on pull_request.edited (body re-check)", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_EDITED });
    mockPRFiles(context, [makeFile("homeassistant/components/random/__init__.py")]);
    const result = await runRule(prAutoLabel, context);
    expect(result?.labels).toContain("integration: random");
  });

  it("also runs on pull_request.synchronize (so the update command can re-evaluate)", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_SYNCHRONIZE });
    mockPRFiles(context, [makeFile("homeassistant/components/random/__init__.py")]);
    const result = await runRule(prAutoLabel, context);
    expect(result?.labels).toContain("integration: random");
  });
});
