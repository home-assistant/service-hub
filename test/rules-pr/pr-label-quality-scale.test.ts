import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prLabelQualityScale } from "../../src/rules-pr/pr-label-quality-scale.js";
import { createMockContext, mockPRFiles, runRule } from "../helpers/mock-context.js";

describe("pr-label-quality-scale", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("adds quality-scale label when quality_scale.yaml is modified", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
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

    const result = await runRule(prLabelQualityScale, context);
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
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "integration: hue" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "integration: hue" }] },
      },
    });
    mockPRFiles(context, []);

    const result = await runRule(prLabelQualityScale, context);
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
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "integration: mydevice" },
        pull_request: {
          head: { sha: "abc123" },
          labels: [{ name: "integration: mydevice" }],
        },
      },
    });
    mockPRFiles(context, []);

    const result = await runRule(prLabelQualityScale, context);
    expect(result?.labels).toContain("Quality Scale: no score");
  });

  it("returns undefined when no quality_scale.yaml and no integration label", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
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

    const result = await runRule(prLabelQualityScale, context);
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
      eventType: EventType.PULL_REQUEST_LABELED,
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

    const result = await runRule(prLabelQualityScale, context);
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

    const result = await runRule(prLabelQualityScale, context);
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
      eventType: EventType.PULL_REQUEST_LABELED,
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

    const result = await runRule(prLabelQualityScale, context);
    expect(result?.labels).toContain("Quality Scale: platinum");
    expect(result?.removeLabels).toEqual(
      expect.arrayContaining(["Quality Scale: silver", "Quality Scale: gold"]),
    );
  });
});
