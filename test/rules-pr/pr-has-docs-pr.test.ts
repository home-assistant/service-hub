import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prHasDocsPr } from "../../src/rules-pr/pr-has-docs-pr.js";
import { createMockContext, runRule } from "../helpers/mock-context.js";

describe("docs-missing handler", () => {
  it("passes when no docs-requiring labels are present", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [{ name: "bugfix" }],
          head: { sha: "abc123" },
          body: "",
          base: { ref: "dev" },
        },
      },
    });

    const result = await runRule(prHasDocsPr, context);
    expect(result).toMatchObject({
      statusCheck: { state: "success" },
      dashboard: { status: "pass" },
    });
  });

  it("fails when new-integration has no docs link", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [{ name: "new-integration" }],
          head: { sha: "abc123" },
          body: "Added a cool new integration",
          base: { ref: "dev" },
        },
      },
    });

    const result = await runRule(prHasDocsPr, context);
    expect(result).toMatchObject({
      statusCheck: { state: "failure" },
      dashboard: { status: "fail" },
    });
  });

  it("passes when new-integration has docs link", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [{ name: "new-integration" }],
          head: { sha: "abc123" },
          body: "Docs PR: home-assistant/home-assistant.io#12345",
          base: { ref: "dev" },
        },
      },
    });

    const result = await runRule(prHasDocsPr, context);
    expect(result).toMatchObject({
      statusCheck: { state: "success" },
      dashboard: { status: "pass" },
    });
  });

  it("passes when docs-missing label is absent even for new-platform with URL link", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [{ name: "new-platform" }],
          head: { sha: "abc123" },
          body: "Docs: https://github.com/home-assistant/home-assistant.io/pull/999",
          base: { ref: "dev" },
        },
      },
    });

    const result = await runRule(prHasDocsPr, context);
    expect(result).toMatchObject({
      statusCheck: { state: "success" },
    });
  });

  it("auto-approves release PRs", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [{ name: "docs-missing" }],
          head: { sha: "abc123" },
          body: "",
          base: { ref: "master" },
        },
      },
    });

    const result = await runRule(prHasDocsPr, context);
    expect(result).toMatchObject({
      statusCheck: { state: "success" },
    });
  });
});
