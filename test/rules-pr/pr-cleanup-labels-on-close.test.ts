import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { cleanupLabelsOnClose } from "../../src/rules-pr/pr-cleanup-labels-on-close.js";
import { createMockContext } from "../helpers/mock-context.js";

const rule = cleanupLabelsOnClose({ labels: ["Ready for review"] });

describe("label-cleaner handler", () => {
  it("removes workflow labels on PR close", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_CLOSED,
      payload: {
        pull_request: {
          labels: [{ name: "Ready for review" }, { name: "bugfix" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await rule.handle(context);
    expect(result).toMatchObject({
      removeLabels: ["Ready for review"],
    });
  });

  it("returns undefined when no labels to clean", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_CLOSED,
      payload: {
        pull_request: {
          labels: [{ name: "bugfix" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await rule.handle(context);
    expect(result).toBeUndefined();
  });

  it("includes description", () => {
    expect(rule.description).toContain("Ready for review");
  });
});
