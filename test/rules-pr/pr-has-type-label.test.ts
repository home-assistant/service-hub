import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { requiredLabels } from "../../src/rules-pr/pr-has-type-label.js";
import { createMockContext } from "../helpers/mock-context.js";

const rule = requiredLabels({
  labels: ["breaking-change", "bugfix", "code-quality", "dependency", "deprecation", "new-feature", "new-integration"],
});

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

    const result = await rule.handle(context);

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

    const result = await rule.handle(context);

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

  it("listens to label and sync events", () => {
    expect(rule.listens).toContain(EventType.PULL_REQUEST_LABELED);
    expect(rule.listens).toContain(EventType.PULL_REQUEST_UNLABELED);
    expect(rule.listens).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
  });

  it("includes description", () => {
    expect(rule.description).toContain("bugfix");
  });
});
