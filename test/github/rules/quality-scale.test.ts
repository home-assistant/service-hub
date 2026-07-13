import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { qualityScale } from "../../../src/github/rules/quality-scale.js";
import { QualityScale } from "../../../src/util/integration.js";
import { createMockContext, mockPRFiles, runRule } from "../helpers/mock-context.js";

describe("quality-scale", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("adds quality-scale label when quality_scale.yaml is modified", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "bugfix" },
        pull_request: { head: { sha: "abc123" }, labels: [] },
      },
    });
    mockPRFiles(context, [
      {
        filename: "homeassistant/components/hue/quality_scale.yaml",
        status: "modified",
        additions: 5,
        deletions: 0,
        changes: 5,
        sha: "abc",
        blob_url: "",
        raw_url: "",
        contents_url: "",
      },
    ]);

    const result = await runRule(qualityScale, context);
    expect(result?.labels).toContain("quality-scale");
  });

  it("fetches manifest and adds quality scale label for integration label", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        domain: "hue",
        name: "Hue",
        quality_scale: "platinum",
        config_flow: true,
        dependencies: [],
        documentation: "",
        requirements: [],
        iot_class: "local_polling",
      }),
    });

    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "integration: hue" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "integration: hue" }] },
      },
    });
    mockPRFiles(context, []);

    const result = await runRule(qualityScale, context);
    expect(result?.labels).toContain("Quality Scale: platinum");
  });

  it("uses 'no score' when manifest has no quality_scale", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        domain: "mydevice",
        name: "My Device",
        config_flow: true,
        dependencies: [],
        documentation: "",
        requirements: [],
        iot_class: "local_polling",
      }),
    });

    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "integration: mydevice" },
        pull_request: {
          head: { sha: "abc123" },
          labels: [{ name: "integration: mydevice" }],
        },
      },
    });
    mockPRFiles(context, []);

    const result = await runRule(qualityScale, context);
    expect(result?.labels).toContain("Quality Scale: no score");
  });

  it("returns undefined when no quality_scale.yaml and no integration label", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "bugfix" },
        pull_request: { head: { sha: "abc123" }, labels: [] },
      },
    });
    mockPRFiles(context, [
      {
        filename: "homeassistant/components/hue/__init__.py",
        status: "modified",
        additions: 5,
        deletions: 0,
        changes: 5,
        sha: "abc",
        blob_url: "",
        raw_url: "",
        contents_url: "",
      },
    ]);

    const result = await runRule(qualityScale, context);
    expect(result).toBeUndefined();
  });

  it("handles both quality_scale.yaml and integration label together", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        domain: "hue",
        name: "Hue",
        quality_scale: "gold",
        config_flow: true,
        dependencies: [],
        documentation: "",
        requirements: [],
        iot_class: "local_polling",
      }),
    });

    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "integration: hue" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "integration: hue" }] },
      },
    });
    mockPRFiles(context, [
      {
        filename: "homeassistant/components/hue/quality_scale.yaml",
        status: "modified",
        additions: 5,
        deletions: 0,
        changes: 5,
        sha: "abc",
        blob_url: "",
        raw_url: "",
        contents_url: "",
      },
    ]);

    const result = await runRule(qualityScale, context);
    expect(result?.labels).toContain("quality-scale");
    expect(result?.labels).toContain("Quality Scale: gold");
  });

  it("emits only the highest scale across multiple integration labels", async () => {
    const scales: Record<string, string> = {
      hue: "silver",
      mqtt: "platinum",
      ohx: "gold",
    };
    globalThis.fetch.mockImplementation(async (url: string) => {
      const domain = (url.match(/components\/([^/]+)\//) ?? [])[1];
      return {
        ok: true,
        json: async () => ({
          domain,
          name: domain,
          quality_scale: scales[domain] ?? "no score",
          config_flow: true,
          dependencies: [],
          documentation: "",
          requirements: [],
          iot_class: "local_polling",
        }),
      };
    });

    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "integration: ohx" },
        pull_request: {
          head: { sha: "abc123" },
          labels: [
            { name: "integration: hue" },
            { name: "integration: mqtt" },
            { name: "integration: ohx" },
          ],
        },
      },
    });
    mockPRFiles(context, []);

    const result = await runRule(qualityScale, context);
    expect(result?.labels).toContain("Quality Scale: platinum");
    expect(result?.labels).not.toContain("Quality Scale: silver");
    expect(result?.labels).not.toContain("Quality Scale: gold");
  });

  it("removes stale Quality Scale labels when a lower-ranked one is on the PR", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        domain: "hue",
        name: "Hue",
        quality_scale: "platinum",
        config_flow: true,
        dependencies: [],
        documentation: "",
        requirements: [],
        iot_class: "local_polling",
      }),
    });

    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "integration: hue" },
        pull_request: {
          head: { sha: "abc123" },
          labels: [
            { name: "integration: hue" },
            { name: "Quality Scale: silver" },
            { name: "Quality Scale: gold" },
          ],
        },
      },
    });
    mockPRFiles(context, []);

    const result = await runRule(qualityScale, context);
    expect(result?.labels).toContain("Quality Scale: platinum");
    expect(result?.removeLabels).toEqual(
      expect.arrayContaining(["Quality Scale: silver", "Quality Scale: gold"]),
    );
  });

  // One integration, one scale → exact `Quality Scale: <tier>` label. Covers
  // every value in the QualityScale enum so a new tier added upstream surfaces
  // here as a missing case.
  it.each(Object.values(QualityScale))("emits 'Quality Scale: %s'", async (scale) => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        domain: "hue",
        name: "Hue",
        quality_scale: scale,
        config_flow: true,
        dependencies: [],
        documentation: "",
        requirements: [],
        iot_class: "local_polling",
      }),
    });

    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "integration: hue" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "integration: hue" }] },
      },
    });
    mockPRFiles(context, []);

    const result = await runRule(qualityScale, context);
    expect(result?.labels).toContain(`Quality Scale: ${scale}`);
  });

  it("derives the integration from changed files on pull_request.opened (no labels yet)", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        domain: "hue",
        name: "Hue",
        quality_scale: "platinum",
        config_flow: true,
        dependencies: [],
        documentation: "",
        requirements: [],
        iot_class: "local_polling",
      }),
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: { head: { sha: "abc123" }, labels: [] },
      },
    });
    mockPRFiles(context, [
      { filename: "homeassistant/components/hue/light.py", status: "modified" },
    ]);

    const result = await runRule(qualityScale, context);
    expect(result?.labels).toContain("Quality Scale: platinum");
  });

  it("subscribes to opened, reopened, synchronize, labeled, and on_demand", () => {
    expect(Object.keys(qualityScale.events)).toContain(EventType.PULL_REQUEST_OPENED);
    expect(Object.keys(qualityScale.events)).toContain(EventType.PULL_REQUEST_REOPENED);
    expect(Object.keys(qualityScale.events)).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
    expect(Object.keys(qualityScale.events)).toContain(EventType.PULL_REQUEST_LABELED);
    expect(Object.keys(qualityScale.events)).toContain(EventType.ON_DEMAND);
  });
});
