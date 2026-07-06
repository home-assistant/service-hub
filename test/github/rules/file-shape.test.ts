import { describe, expect, it } from "bun:test";
import { EventType } from "../../../src/github/engine/event.js";
import { fileShape } from "../../../src/github/rules/file-shape.js";
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

describe("file-shape", () => {
  describe("has-tests", () => {
    it("adds has-tests when test files are present", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py"),
        makeFile("tests/components/hue/test_init.py"),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels).toContain("has-tests");
    });

    it("does not add has-tests when no test files", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

      const result = await runRule(fileShape, context);
      expect(result?.labels ?? []).not.toContain("has-tests");
    });
  });

  describe("core label", () => {
    it("adds core label for core component files", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [makeFile("homeassistant/components/mqtt/__init__.py")]);

      const result = await runRule(fileShape, context);
      expect(result?.labels).toContain("core");
    });

    it("adds core label for helper files", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [makeFile("homeassistant/helpers/entity.py")]);

      const result = await runRule(fileShape, context);
      expect(result?.labels).toContain("core");
    });
  });

  describe("new-integration", () => {
    it("adds new-integration when a component __init__.py is added", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels).toContain("new-integration");
    });

    it("does not add new-integration when __init__.py is only modified", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { status: "modified" }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels ?? []).not.toContain("new-integration");
    });

    it("removes new-integration when files no longer add an integration", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
        payload: {
          pull_request: {
            body: "",
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [{ name: "new-integration" }],
          },
        },
      });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { status: "modified" }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.removeLabels).toContain("new-integration");
    });
  });

  describe("new-platform", () => {
    it("adds new-platform when a platform file is added to an existing integration", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/sensor.py", { status: "added" }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels).toContain("new-platform");
    });

    it("does not add new-platform when the PR adds a brand-new integration", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
        makeFile("homeassistant/components/newdevice/sensor.py", { status: "added" }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels ?? []).not.toContain("new-platform");
    });
  });

  describe("remove-platform", () => {
    it("adds remove-platform when a platform file is removed", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/sensor.py", { status: "removed" }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels).toContain("remove-platform");
    });
  });

  describe("small-pr", () => {
    it("adds small-pr when additions are below threshold", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { additions: 5 }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels).toContain("small-pr");
    });

    it("does not add small-pr when additions are above threshold", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { additions: 50 }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels ?? []).not.toContain("small-pr");
    });

    it("excludes test files from small-pr threshold count", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { additions: 5 }),
        makeFile("tests/components/hue/test_init.py", { additions: 200 }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels).toContain("small-pr");
    });
  });

  describe("metadata-only", () => {
    it("adds metadata-only when all files are metadata", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/manifest.json"),
        makeFile("CODEOWNERS"),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels).toContain("metadata-only");
    });

    it("does not add metadata-only when non-metadata files present", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/manifest.json"),
        makeFile("homeassistant/components/hue/__init__.py"),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels ?? []).not.toContain("metadata-only");
    });
  });

  describe("config-flow", () => {
    it("adds config-flow when config_flow.py is added without __init__.py", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/config_flow.py", { status: "added" }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels).toContain("config-flow");
    });

    it("does not add config-flow when __init__.py is also added (new integration)", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { status: "added" }),
        makeFile("homeassistant/components/hue/config_flow.py", { status: "added" }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.labels ?? []).not.toContain("config-flow");
    });
  });

  describe("reconciliation", () => {
    it("removes a previously-applied owned label that no longer fits", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
        payload: {
          pull_request: {
            body: "",
            base: { ref: "dev" },
            head: { sha: "abc123" },
            // small-pr was applied earlier; PR has since grown.
            labels: [{ name: "small-pr" }],
          },
        },
      });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { additions: 200 }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.removeLabels).toContain("small-pr");
    });

    it("does not touch labels this rule does not own", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
        payload: {
          pull_request: {
            body: "",
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [{ name: "bugfix" }, { name: "integration: hue" }],
          },
        },
      });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py", { additions: 200 }),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.removeLabels ?? []).not.toContain("bugfix");
      expect(result?.removeLabels ?? []).not.toContain("integration: hue");
    });

    it("keeps labels that still apply", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
        payload: {
          pull_request: {
            body: "",
            base: { ref: "dev" },
            head: { sha: "abc123" },
            labels: [{ name: "has-tests" }],
          },
        },
      });
      mockPRFiles(context, [
        makeFile("homeassistant/components/hue/__init__.py"),
        makeFile("tests/components/hue/test_init.py"),
      ]);

      const result = await runRule(fileShape, context);
      expect(result?.removeLabels ?? []).not.toContain("has-tests");
      expect(result?.labels).toContain("has-tests");
    });
  });

  it("returns small-pr and metadata-only for empty file list", async () => {
    // 0 additions < 30 threshold, and [].every() is vacuously true
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, []);

    const result = await runRule(fileShape, context);
    expect(result?.labels).toContain("small-pr");
    expect(result?.labels).toContain("metadata-only");
  });
});
