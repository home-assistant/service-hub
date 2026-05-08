import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prLabelQualityScale } from "../../src/rules-pr/pr-label-quality-scale.js";
import { createMockContext, mockPRFiles } from "../helpers/mock-context.js";

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

    const result = await prLabelQualityScale.handle(context);
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
        pull_request: { head: { sha: "abc123" }, labels: [] },
      },
    });
    mockPRFiles(context, []);

    const result = await prLabelQualityScale.handle(context);
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
        pull_request: { head: { sha: "abc123" }, labels: [] },
      },
    });
    mockPRFiles(context, []);

    const result = await prLabelQualityScale.handle(context);
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

    const result = await prLabelQualityScale.handle(context);
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

    const result = await prLabelQualityScale.handle(context);
    expect(result?.labels).toContain("quality-scale");
    expect(result?.labels).toContain("Quality Scale: gold");
  });
});
