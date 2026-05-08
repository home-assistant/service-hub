import { afterEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prHacktoberfest } from "../../src/rules-pr/pr-hacktoberfest.js";
import { createMockContext } from "../helpers/mock-context.js";

describe("pr-hacktoberfest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("PR opened", () => {
    it("adds Hacktoberfest label in October when repo has topic", async () => {
      vi.spyOn(Date.prototype, "getMonth").mockReturnValue(9); // October = 9

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
    });

    it("does nothing outside October", async () => {
      vi.spyOn(Date.prototype, "getMonth").mockReturnValue(5); // June

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
    });

    it("does nothing when repo lacks hacktoberfest topic", async () => {
      vi.spyOn(Date.prototype, "getMonth").mockReturnValue(9);

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
    });

    it("does nothing for bot senders", async () => {
      vi.spyOn(Date.prototype, "getMonth").mockReturnValue(9);

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
