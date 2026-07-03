import { describe, expect, it } from "bun:test";
import { docsParenting } from "../../src/checks/docs-parenting.js";
import { EventType } from "../../src/engine/event.js";
import { createMockContext, createMockGitHub, runRule } from "../helpers/mock-context.js";

describe("docs-parenting-code-side", () => {
  describe("code repo opened/edited", () => {
    it("emits a addLabelsCrossRepo effect for linked docs PRs", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: {
          pull_request: {
            body: "Docs: home-assistant/home-assistant.io#999",
            head: { sha: "abc123" },
          },
        },
      });

      const result = await runRule(docsParenting, context);
      expect(result?.effects).toHaveLength(1);
      const effect = result?.effects[0];
      expect(effect).toMatchObject({
        type: "addLabelsCrossRepo",
        owner: "home-assistant",
        repo: "home-assistant.io",
        issue_number: 999,
        labels: ["has-parent"],
      });
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

      const result = await runRule(docsParenting, context);
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

      const result = await runRule(docsParenting, context);
      expect(result).toBeUndefined();
    });
  });

  describe("PR closed/reopened", () => {
    it("emits updatePullRequest to close the docs PR when parent closes unmerged", async () => {
      const github = createMockGitHub();
      github.pulls.get.mockResolvedValue({ data: { state: "open", merged: false } });
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_CLOSED,
        github,
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

      const result = await runRule(docsParenting, context);
      const effect = result?.effects.find((e) => e.type === "updatePullRequest");
      expect(effect).toMatchObject({
        type: "updatePullRequest",
        owner: "home-assistant",
        repo: "home-assistant.io",
        pull_number: 999,
        state: "closed",
      });
    });

    it("emits updatePullRequest to reopen the docs PR when parent reopens", async () => {
      const github = createMockGitHub();
      github.pulls.get.mockResolvedValue({ data: { state: "closed", merged: false } });
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_REOPENED,
        github,
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

      const result = await runRule(docsParenting, context);
      const effect = result?.effects.find((e) => e.type === "updatePullRequest");
      expect(effect).toMatchObject({
        type: "updatePullRequest",
        owner: "home-assistant",
        repo: "home-assistant.io",
        pull_number: 999,
        state: "open",
      });
    });
  });

  it("listens to opened, reopened, closed, and edited events", () => {
    expect(Object.keys(docsParenting.events)).toContain(EventType.PULL_REQUEST_OPENED);
    expect(Object.keys(docsParenting.events)).toContain(EventType.PULL_REQUEST_REOPENED);
    expect(Object.keys(docsParenting.events)).toContain(EventType.PULL_REQUEST_CLOSED);
    expect(Object.keys(docsParenting.events)).toContain(EventType.PULL_REQUEST_EDITED);
  });
});
