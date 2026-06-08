import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prLabelIntegrationName } from "../../src/rules-pr/pr-label-integration-name.js";
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

describe("pr-label-integration-name", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ integrations: {} }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("adds integration label for component files", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

    const result = await runRule(prLabelIntegrationName, context);
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

    const result = await runRule(prLabelIntegrationName, context);
    expect(result?.labels).toBeUndefined();
  });

  it("does not add Top labels for PRs touching core", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ integrations: { mqtt: 100000 } }),
    });

    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/components/mqtt/__init__.py")]);

    const result = await runRule(prLabelIntegrationName, context);
    expect(result?.labels ?? []).not.toContain("Top 50");
  });

  it("does not add Top labels when the PR adds a new integration", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ integrations: { newdevice: 100000 } }),
    });

    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [
      makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
    ]);

    const result = await runRule(prLabelIntegrationName, context);
    expect(result?.labels ?? []).not.toContain("Top 50");
  });

  it("adds Top labels for a touched popular integration that isn't core or new", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ integrations: { hue: 100000 } }),
    });

    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/components/hue/sensor.py")]);

    const result = await runRule(prLabelIntegrationName, context);
    expect(result?.labels).toContain("Top 50");
    expect(result?.labels).toContain("Top 100");
    expect(result?.labels).toContain("Top 200");
  });

  it("returns nothing for an empty file list", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, []);

    const result = await runRule(prLabelIntegrationName, context);
    expect(result).toBeUndefined();
  });

  it("skips for bot senders", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        sender: { login: "dependabot[bot]", type: "Bot" },
      },
    });
    mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

    const result = await runRule(prLabelIntegrationName, context);
    expect(result).toBeUndefined();
  });
});
