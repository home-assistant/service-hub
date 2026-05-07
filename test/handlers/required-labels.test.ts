import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { requiredLabelsHandler } from "../../src/handlers/required-labels.js";
import { createMockContext } from "../helpers/mock-context.js";

describe("required-labels handler", () => {
  it("returns failure status when no required label is present", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [{ name: "some-random-label" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await requiredLabelsHandler.handle(context);

    expect(result).toMatchObject({
      statusCheck: {
        context: "required-labels",
        state: "failure",
      },
      dashboard: {
        id: "required-labels",
        status: "fail",
      },
    });
  });

  it("returns success status when a required label is present", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [{ name: "bugfix" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await requiredLabelsHandler.handle(context);

    expect(result).toMatchObject({
      statusCheck: {
        context: "required-labels",
        state: "success",
      },
      dashboard: {
        id: "required-labels",
        status: "pass",
      },
    });
  });

  it("returns void for unconfigured repos", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        repository: {
          full_name: "home-assistant/frontend",
          name: "frontend",
          owner: { login: "home-assistant" },
        },
        pull_request: {
          labels: [{ name: "bugfix" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await requiredLabelsHandler.handle(context);
    expect(result).toBeUndefined();
  });

  it("listens to label and sync events", () => {
    expect(requiredLabelsHandler.listens).toContain(EventType.PULL_REQUEST_LABELED);
    expect(requiredLabelsHandler.listens).toContain(EventType.PULL_REQUEST_UNLABELED);
    expect(requiredLabelsHandler.listens).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
  });
});
