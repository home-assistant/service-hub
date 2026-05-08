import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prAutoLabel } from "../../src/rules-pr/pr-auto-label.js";
import { createMockContext, mockPRFiles } from "../helpers/mock-context.js";

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

      const result = await prAutoLabel.handle(context);
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

      const result = await prAutoLabel.handle(context);
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

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).toContain("has-tests");
    });

    it("does not add has-tests when no test files", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).not.toContain("has-tests");
    });
  });

  describe("core label", () => {
    it("adds core label for core component files", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [makeFile("homeassistant/components/mqtt/__init__.py")]);

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).toContain("core");
    });

    it("adds core label for helper files", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [makeFile("homeassistant/helpers/entity.py")]);

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).toContain("core");
    });
  });

  describe("new-integration and new-platform", () => {
    it("adds new-integration when __init__.py is added", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
      ]);

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).toContain("new-integration");
    });

    it("adds new-platform when platform file is added", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/sensor.py", { status: "added" }),
      ]);

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).toContain("new-platform");
    });

    it("prefers new-integration over new-platform", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
        makeFile("homeassistant/components/newdevice/sensor.py", { status: "added" }),
      ]);

      const result = await prAutoLabel.handle(context);
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

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).toContain("remove-platform");
    });
  });

  describe("small-pr", () => {
    it("adds small-pr when additions are below threshold", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { additions: 5 }),
      ]);

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).toContain("small-pr");
    });

    it("does not add small-pr when additions are above threshold", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { additions: 50 }),
      ]);

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).not.toContain("small-pr");
    });

    it("excludes test files from small-pr threshold count", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { additions: 5 }),
        makeFile("tests/components/hue/test_init.py", { additions: 200 }),
      ]);

      const result = await prAutoLabel.handle(context);
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

      const result = await prAutoLabel.handle(context);
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

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).not.toContain("bugfix");
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

      const result = await prAutoLabel.handle(context);
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

      const result = await prAutoLabel.handle(context);
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

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).toContain("metadata-only");
    });

    it("does not add metadata-only when non-metadata files present", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/manifest.json"),
        makeFile("homeassistant/components/hue/__init__.py"),
      ]);

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).not.toContain("metadata-only");
    });
  });

  describe("config-flow", () => {
    it("adds config-flow when config_flow.py is added without __init__.py", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/config_flow.py", { status: "added" }),
      ]);

      const result = await prAutoLabel.handle(context);
      expect(result?.labels).toContain("config-flow");
    });

    it("does not add config-flow when __init__.py is also added (new integration)", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { status: "added" }),
        makeFile("homeassistant/components/hue/config_flow.py", { status: "added" }),
      ]);

      const result = await prAutoLabel.handle(context);
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

      const result = await prAutoLabel.handle(context);
      // mqtt is a core component, so LABELS_PREVENT_TOP prevents top labels
      expect(result?.labels).not.toContain("Top 50");
    });
  });

  it("returns small-pr and metadata-only for empty file list", async () => {
    // 0 additions < 30 threshold, and [].every() is vacuously true
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, []);

    const result = await prAutoLabel.handle(context);
    expect(result?.labels).toContain("small-pr");
    expect(result?.labels).toContain("metadata-only");
  });

  it("does not allow bots", () => {
    expect(prAutoLabel.allowBots).toBe(false);
  });
});
