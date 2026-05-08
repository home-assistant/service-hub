import { describe, expect, it, vi } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prHacktoberfest } from "../../src/rules-pr/pr-hacktoberfest.js";
import { createMockContext } from "../helpers/mock-context.js";

describe("pr-hacktoberfest", () => {
  describe("PR opened", () => {
    it("adds Hacktoberfest label in October when repo has topic", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 9, 15)); // October = month 9

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          repository: {
            full_name: "home-assistant/core",
            name: "core",
            owner: { login: "home-assistant" },
            topics: ["hacktoberfest"],
          },
        },
      });

      const result = await prHacktoberfest.handle(context);
      expect(result).toMatchObject({ labels: ["Hacktoberfest"] });

      vi.useRealTimers();
    });

    it("does nothing outside October", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 5, 15)); // June

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          repository: {
            full_name: "home-assistant/core",
            name: "core",
            owner: { login: "home-assistant" },
            topics: ["hacktoberfest"],
          },
        },
      });

      const result = await prHacktoberfest.handle(context);
      expect(result).toBeUndefined();

      vi.useRealTimers();
    });

    it("does nothing when repo lacks hacktoberfest topic", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 9, 15));

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          repository: {
            full_name: "home-assistant/core",
            name: "core",
            owner: { login: "home-assistant" },
            topics: [],
          },
        },
      });

      const result = await prHacktoberfest.handle(context);
      expect(result).toBeUndefined();

      vi.useRealTimers();
    });

    it("does nothing for bot senders", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 9, 15));

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          sender: { login: "dependabot[bot]", type: "Bot" },
          repository: {
            full_name: "home-assistant/core",
            name: "core",
            owner: { login: "home-assistant" },
            topics: ["hacktoberfest"],
          },
        },
      });

      const result = await prHacktoberfest.handle(context);
      expect(result).toBeUndefined();

      vi.useRealTimers();
    });
  });

  describe("PR closed", () => {
    it("removes Hacktoberfest label when closed without merge", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_CLOSED,
        payload: {
          pull_request: {
            merged: false,
            labels: [{ name: "Hacktoberfest" }],
            head: { sha: "abc123" },
          },
        },
      });

      const result = await prHacktoberfest.handle(context);
      expect(result).toMatchObject({ removeLabels: ["Hacktoberfest"] });
    });

    it("keeps label when PR is merged", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_CLOSED,
        payload: {
          pull_request: {
            merged: true,
            labels: [{ name: "Hacktoberfest" }],
            head: { sha: "abc123" },
          },
        },
      });

      const result = await prHacktoberfest.handle(context);
      expect(result).toBeUndefined();
    });

    it("does nothing when Hacktoberfest label is absent", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_CLOSED,
        payload: {
          pull_request: {
            merged: false,
            labels: [{ name: "bugfix" }],
            head: { sha: "abc123" },
          },
        },
      });

      const result = await prHacktoberfest.handle(context);
      expect(result).toBeUndefined();
    });
  });

  it("listens to opened and closed events", () => {
    expect(prHacktoberfest.listens).toContain(EventType.PULL_REQUEST_OPENED);
    expect(prHacktoberfest.listens).toContain(EventType.PULL_REQUEST_CLOSED);
  });
});
