import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { blockingLabelsHandler } from "../../src/handlers/blocking-labels.js";
import { createMockContext } from "../helpers/mock-context.js";

describe("blocking-labels handler", () => {
  it("returns actions for configured repos", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [{ name: "awaiting-frontend" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await blockingLabelsHandler.handle(context);
    expect(result).toBeDefined();
    expect(result?.actions).toHaveLength(1);
  });

  it("returns undefined for unconfigured repos", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        repository: {
          full_name: "home-assistant/brands",
          name: "brands",
          owner: { login: "home-assistant" },
        },
        pull_request: {
          labels: [],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await blockingLabelsHandler.handle(context);
    expect(result).toBeUndefined();
  });
});
