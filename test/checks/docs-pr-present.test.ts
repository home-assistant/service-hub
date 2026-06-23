import { describe, expect, it } from "vitest";
import { docsPrPresent } from "../../src/checks/docs-pr-present.js";
import { EventType } from "../../src/github/types.js";
import { createMockContext, runRule } from "../helpers/mock-context.js";

describe("docs-missing handler", () => {
  it("skips when no docs-requiring labels are present", async () => {
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

    const result = await runRule(docsPrPresent, context);
    expect(result?.dashboard).toMatchObject({ id: "docs-missing", status: "skip" });
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

    const result = await runRule(docsPrPresent, context);
    expect(result?.dashboard).toMatchObject({ id: "docs-missing", status: "fail" });
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

    const result = await runRule(docsPrPresent, context);
    expect(result?.dashboard).toMatchObject({ id: "docs-missing", status: "pass" });
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

    const result = await runRule(docsPrPresent, context);
    expect(result?.dashboard?.status).toBe("pass");
  });

  it("auto-approves (skips) release PRs", async () => {
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

    const result = await runRule(docsPrPresent, context);
    expect(result?.dashboard?.status).toBe("skip");
  });

  it("does not emit a statusCheck — the dispatcher synthesizes the aggregate one", async () => {
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
    const result = await runRule(docsPrPresent, context);
    expect(result?.statusChecks).toHaveLength(0);
  });
});
