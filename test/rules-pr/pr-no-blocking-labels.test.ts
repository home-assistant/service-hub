import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { blockingLabels } from "../../src/rules-pr/pr-no-blocking-labels.js";
import { createMockContext } from "../helpers/mock-context.js";

const rule = blockingLabels({
  "awaiting-frontend": { message: "This PR is awaiting changes to the frontend" },
});

describe("blocking-labels handler", () => {
  it("returns actions when blocking label is present", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [{ name: "awaiting-frontend" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await rule.handle(context);
    expect(result).toBeDefined();
    expect(result?.actions).toHaveLength(1);
  });

  it("returns actions even when no blocking labels are present (to set success status)", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await rule.handle(context);
    expect(result).toBeDefined();
    expect(result?.actions).toHaveLength(1);
  });

  it("includes description", () => {
    expect(rule.description).toContain("awaiting-frontend");
  });
});
