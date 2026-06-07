import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { blockingLabels } from "../../src/rules-pr/pr-no-blocking-labels.js";
import { createMockContext, runRule } from "../helpers/mock-context.js";

const rule = blockingLabels({
  "awaiting-frontend": { message: "This PR is awaiting changes to the frontend" },
  "other-block": { message: "Another blocker" },
});

describe("blocking-labels handler", () => {
  it("emits failure status when a configured label is added", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        action: "labeled",
        label: { name: "awaiting-frontend" },
        pull_request: {
          labels: [{ name: "awaiting-frontend" }],
          head: { sha: "abc123" },
          number: 1,
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeDefined();
    expect(result?.dashboards).toHaveLength(1);
  });

  it("emits success status when a configured label is removed", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_UNLABELED,
      payload: {
        action: "unlabeled",
        label: { name: "awaiting-frontend" },
        pull_request: {
          labels: [],
          head: { sha: "abc123" },
          number: 1,
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeDefined();
    expect(result?.dashboards).toHaveLength(1);
  });

  it("emits no status when a non-blocking label is added/removed", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        action: "labeled",
        label: { name: "unrelated" },
        pull_request: {
          labels: [{ name: "unrelated" }],
          head: { sha: "abc123" },
          number: 1,
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
  });

  it("emits a status for every configured label on synchronize", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      payload: {
        action: "synchronize",
        pull_request: {
          labels: [{ name: "awaiting-frontend" }],
          head: { sha: "abc123" },
          number: 1,
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result?.dashboards).toHaveLength(2);
  });

  it("includes description", () => {
    expect(rule.description).toContain("awaiting-frontend");
  });
});
