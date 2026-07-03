import { afterEach, describe, expect, it, vi } from "vitest";
import { integrationTopRank } from "../../src/checks/integration-top-rank.js";
import { EventType } from "../../src/engine/event.js";
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

function mockAnalytics(integrations: Record<string, number>) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ integrations }),
  });
}

describe("integration-top-rank", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("adds Top labels for a touched popular integration that isn't core or new", async () => {
    mockAnalytics({ hue: 100000 });

    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/components/hue/sensor.py")]);

    const result = await runRule(integrationTopRank, context);
    expect(result?.labels).toContain("Top 50");
    expect(result?.labels).toContain("Top 100");
    expect(result?.labels).toContain("Top 200");
  });

  it("does not add Top labels for PRs touching core", async () => {
    mockAnalytics({ mqtt: 100000 });

    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/core.py")]);

    const result = await runRule(integrationTopRank, context);
    expect(result).toBeUndefined();
  });

  it("does not add Top labels when the PR adds a new integration", async () => {
    mockAnalytics({ newdevice: 100000 });

    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [
      makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
      makeFile("homeassistant/components/newdevice/manifest.json", { status: "added" }),
    ]);

    const result = await runRule(integrationTopRank, context);
    expect(result).toBeUndefined();
  });

  it("adds no labels when the touched integration isn't popular enough", async () => {
    mockAnalytics({ hue: 100000 });

    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/components/obscure/sensor.py")]);

    const result = await runRule(integrationTopRank, context);
    expect(result).toBeUndefined();
  });
});
