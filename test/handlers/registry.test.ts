import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import type { RegistryConfig } from "../../src/handlers/registry.js";
import { matchHandlers } from "../../src/handlers/registry.js";
import type { WebhookHandler } from "../../src/handlers/types.js";
import { createMockContext } from "../helpers/mock-context.js";

const testHandler: WebhookHandler = {
  name: "test-handler",
  listens: [EventType.PULL_REQUEST_OPENED],
  async handle() {},
};

const noBotHandler: WebhookHandler = {
  name: "no-bot-handler",
  allowBots: false,
  listens: [EventType.PULL_REQUEST_OPENED],
  async handle() {},
};

const orgHandler: WebhookHandler = {
  name: "org-handler",
  listens: [EventType.PULL_REQUEST_OPENED],
  async handle() {},
};

describe("matchHandlers", () => {
  it("matches repo handler with correct event type", () => {
    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [testHandler] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    const matched = matchHandlers(config, context);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe("test-handler");
  });

  it("does not match handler with wrong event type", () => {
    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [testHandler] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_CLOSED });
    const matched = matchHandlers(config, context);
    expect(matched).toHaveLength(0);
  });

  it("does not match handler for different repo", () => {
    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/frontend": [testHandler] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    // context defaults to home-assistant/core
    const matched = matchHandlers(config, context);
    expect(matched).toHaveLength(0);
  });

  it("matches org-level handlers", () => {
    const config: RegistryConfig = {
      organizations: { "home-assistant": [orgHandler] },
      repositories: {},
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    const matched = matchHandlers(config, context);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe("org-handler");
  });

  it("combines repo and org handlers without duplicates", () => {
    const sharedHandler: WebhookHandler = {
      name: "shared",
      listens: [EventType.PULL_REQUEST_OPENED],
      async handle() {},
    };
    const config: RegistryConfig = {
      organizations: { "home-assistant": [sharedHandler] },
      repositories: { "home-assistant/core": [sharedHandler, testHandler] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    const matched = matchHandlers(config, context);
    expect(matched).toHaveLength(2);
    expect(matched.map((h) => h.name)).toEqual(["shared", "test-handler"]);
  });

  it("filters out bots when allowBots is false", () => {
    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [noBotHandler] },
    };
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: { sender: { login: "dependabot[bot]", type: "Bot" } },
    });
    const matched = matchHandlers(config, context);
    expect(matched).toHaveLength(0);
  });

  it("allows bots by default", () => {
    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [testHandler] },
    };
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: { sender: { login: "dependabot[bot]", type: "Bot" } },
    });
    const matched = matchHandlers(config, context);
    expect(matched).toHaveLength(1);
  });

  it("returns empty for unknown repo/org", () => {
    const config: RegistryConfig = {
      organizations: {},
      repositories: {},
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    const matched = matchHandlers(config, context);
    expect(matched).toHaveLength(0);
  });
});
