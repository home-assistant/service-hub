import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wth } from "../../src/checks/wth.js";
import { EventType } from "../../src/engine/event.js";
import { createMockContext, runRule } from "../helpers/mock-context.js";

describe("wth", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("labels WTH when forum link has matching category_id", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ category_id: 56 }),
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          body: "Fixes https://community.home-assistant.io/t/some-wth/12345",
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(wth, context);
    expect(result).toMatchObject({ labels: ["WTH"] });
  });

  it("labels WTH for alternative category_id 61", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ category_id: 61 }),
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          body: "Fixes https://community.home-assistant.io/t/another-wth/99",
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(wth, context);
    expect(result).toMatchObject({ labels: ["WTH"] });
  });

  it("does not label when category_id does not match", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ category_id: 10 }),
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          body: "See https://community.home-assistant.io/t/feature-request/100",
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(wth, context);
    expect(result).toBeUndefined();
  });

  it("does not label when no forum links in body", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          body: "Just a regular PR",
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(wth, context);
    expect(result).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("handles fetch errors gracefully", async () => {
    globalThis.fetch.mockRejectedValue(new Error("network error"));

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          body: "See https://community.home-assistant.io/t/topic/1",
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(wth, context);
    expect(result).toBeUndefined();
  });

  it("handles non-ok responses gracefully", async () => {
    globalThis.fetch.mockResolvedValue({ ok: false });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          body: "See https://community.home-assistant.io/t/topic/1",
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(wth, context);
    expect(result).toBeUndefined();
  });
});
