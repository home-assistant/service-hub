import { describe, expect, it } from "vitest";
import type { RegistryConfig } from "../../../../../src/github/engine/dispatch.js";
import { dispatch } from "../../../../../src/github/engine/dispatch.js";
import { EventType } from "../../../../../src/github/engine/event.js";
import { docsPrPresent } from "../../../../../src/github/manifests/home-assistant-core/rules/docs-pr-present.js";
import { fileShape } from "../../../../../src/github/manifests/home-assistant-core/rules/file-shape.js";
import {
  createMockContext,
  createMockGitHub,
  mockPRFiles,
  runRule,
} from "../../../helpers/mock-context.js";

describe("docs-missing handler", () => {
  it("skips when no docs-requiring labels are present", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
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
    expect(result?.section).toMatchObject({ id: "docs-missing", status: "skip" });
  });

  it("fails when new-integration has no docs link", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
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
    expect(result?.section).toMatchObject({ id: "docs-missing", status: "fail" });
  });

  it("passes when new-integration has docs link", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
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
    expect(result?.section).toMatchObject({ id: "docs-missing", status: "pass" });
  });

  it("passes when docs-missing label is absent even for new-platform with URL link", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
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
    expect(result?.section?.status).toBe("pass");
  });

  it("auto-approves (skips) release PRs", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
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
    expect(result?.section?.status).toBe("skip");
  });

  it("emits only its status section — the dispatcher synthesizes the aggregate check", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
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
    expect(result?.effects.every((e) => e.type === "statusSection")).toBe(true);
  });

  it("fires on PR creation when the PR adds a new integration", async () => {
    const github = createMockGitHub();

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [fileShape, docsPrPresent] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      payload: {
        pull_request: { labels: [], body: "Added a cool new integration", base: { ref: "dev" } },
      },
    });
    mockPRFiles(context, [
      { filename: "homeassistant/components/mydevice/__init__.py", status: "added" },
    ]);

    const effects = await dispatch(context);

    expect(effects).toContainEqual(
      expect.objectContaining({
        type: "statusSection",
        section: expect.objectContaining({ id: "docs-missing", status: "fail" }),
      }),
    );
  });
});
