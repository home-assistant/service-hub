import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import type { RegistryConfig } from "../../src/rules/registry.js";
import { matchRules } from "../../src/rules/registry.js";
import type { Rule } from "../../src/rules/types.js";
import { createMockContext } from "../helpers/mock-context.js";

const testRule: Rule = {
  name: "test-rule",
  listens: [EventType.PULL_REQUEST_OPENED],
  async handle() {},
};

const noBotRule: Rule = {
  name: "no-bot-rule",
  allowBots: false,
  listens: [EventType.PULL_REQUEST_OPENED],
  async handle() {},
};

const orgRule: Rule = {
  name: "org-rule",
  listens: [EventType.PULL_REQUEST_OPENED],
  async handle() {},
};

describe("matchRules", () => {
  it("matches repo rule with correct event type", () => {
    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [testRule] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    const matched = matchRules(config, context);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe("test-rule");
  });

  it("does not match rule with wrong event type", () => {
    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [testRule] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_CLOSED });
    const matched = matchRules(config, context);
    expect(matched).toHaveLength(0);
  });

  it("does not match rule for different repo", () => {
    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/frontend": [testRule] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    const matched = matchRules(config, context);
    expect(matched).toHaveLength(0);
  });

  it("matches org-level rules", () => {
    const config: RegistryConfig = {
      organizations: { "home-assistant": [orgRule] },
      repositories: {},
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    const matched = matchRules(config, context);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe("org-rule");
  });

  it("combines repo and org rules without duplicates", () => {
    const sharedRule: Rule = {
      name: "shared",
      listens: [EventType.PULL_REQUEST_OPENED],
      async handle() {},
    };
    const config: RegistryConfig = {
      organizations: { "home-assistant": [sharedRule] },
      repositories: { "home-assistant/core": [sharedRule, testRule] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    const matched = matchRules(config, context);
    expect(matched).toHaveLength(2);
    expect(matched.map((r) => r.name)).toEqual(["shared", "test-rule"]);
  });

  it("filters out bots when allowBots is false", () => {
    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [noBotRule] },
    };
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: { sender: { login: "dependabot[bot]", type: "Bot" } },
    });
    const matched = matchRules(config, context);
    expect(matched).toHaveLength(0);
  });

  it("allows bots by default", () => {
    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [testRule] },
    };
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: { sender: { login: "dependabot[bot]", type: "Bot" } },
    });
    const matched = matchRules(config, context);
    expect(matched).toHaveLength(1);
  });

  it("returns empty for unknown repo/org", () => {
    const config: RegistryConfig = {
      organizations: {},
      repositories: {},
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    const matched = matchRules(config, context);
    expect(matched).toHaveLength(0);
  });
});
