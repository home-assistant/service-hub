import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prDocsParenting } from "../../src/rules-pr/pr-docs-parenting.js";
import { createMockContext, createMockGitHub } from "../helpers/mock-context.js";

describe("pr-docs-parenting", () => {
  describe("code repo opened/edited", () => {
    it("labels linked docs PRs with has-parent", async () => {
      const github = createMockGitHub();
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        payload: {
          pull_request: {
            body: "Docs: home-assistant/home-assistant.io#999",
            head: { sha: "abc123" },
          },
        },
      });

      const result = await prDocsParenting.handle(context);
      expect(result?.actions).toHaveLength(1);

      // Execute the action
      expect(result?.actions?.[0]).toBeDefined();
      if (result?.actions?.[0]) await result.actions[0](context);
      expect(github.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: "home-assistant",
          repo: "home-assistant.io",
          issue_number: 999,
          labels: ["has-parent"],
        }),
      );
    });

    it("does nothing when no docs links", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "Just a normal PR",
            head: { sha: "abc123" },
          },
        },
      });

      const result = await prDocsParenting.handle(context);
      expect(result).toBeUndefined();
    });

    it("does nothing when more than 2 docs links", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "home-assistant/home-assistant.io#1 home-assistant/home-assistant.io#2 home-assistant/home-assistant.io#3",
            head: { sha: "abc123" },
          },
        },
      });

      const result = await prDocsParenting.handle(context);
      expect(result).toBeUndefined();
    });
  });

  describe("docs repo opened/edited", () => {
    it("labels docs PR with has-parent when linking to code repo", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          repository: {
            full_name: "home-assistant/home-assistant.io",
            name: "home-assistant.io",
            owner: { login: "home-assistant" },
          },
          pull_request: {
            body: "Parent: home-assistant/core#1234",
            head: { sha: "abc123" },
          },
        },
      });

      const result = await prDocsParenting.handle(context);
      expect(result).toMatchObject({ labels: ["has-parent"] });
    });

    it("does nothing when docs PR has no code links", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          repository: {
            full_name: "home-assistant/home-assistant.io",
            name: "home-assistant.io",
            owner: { login: "home-assistant" },
          },
          pull_request: {
            body: "Updated docs formatting",
            head: { sha: "abc123" },
          },
        },
      });

      const result = await prDocsParenting.handle(context);
      expect(result).toBeUndefined();
    });

    it("does not label when linking to self (docs repo)", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          repository: {
            full_name: "home-assistant/home-assistant.io",
            name: "home-assistant.io",
            owner: { login: "home-assistant" },
          },
          pull_request: {
            body: "Related: home-assistant/home-assistant.io#500",
            head: { sha: "abc123" },
          },
        },
      });

      const result = await prDocsParenting.handle(context);
      expect(result).toBeUndefined();
    });
  });

  describe("PR closed/reopened", () => {
    it("returns an action for close events", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_CLOSED,
        payload: {
          action: "closed",
          pull_request: {
            body: "Docs: home-assistant/home-assistant.io#999",
            state: "closed",
            merged: false,
            head: { sha: "abc123" },
          },
        },
      });

      const result = await prDocsParenting.handle(context);
      expect(result?.actions).toHaveLength(1);
    });

    it("returns an action for reopen events", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_REOPENED,
        payload: {
          action: "reopened",
          pull_request: {
            body: "Docs: home-assistant/home-assistant.io#999",
            state: "open",
            merged: false,
            head: { sha: "abc123" },
          },
        },
      });

      const result = await prDocsParenting.handle(context);
      expect(result?.actions).toHaveLength(1);
    });
  });

  it("listens to opened, reopened, closed, and edited events", () => {
    expect(prDocsParenting.listens).toContain(EventType.PULL_REQUEST_OPENED);
    expect(prDocsParenting.listens).toContain(EventType.PULL_REQUEST_REOPENED);
    expect(prDocsParenting.listens).toContain(EventType.PULL_REQUEST_CLOSED);
    expect(prDocsParenting.listens).toContain(EventType.PULL_REQUEST_EDITED);
  });
});
