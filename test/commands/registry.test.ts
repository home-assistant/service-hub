import { describe, expect, it, mock } from "bun:test";
import type { CommandRegistryConfig } from "../../src/commands/registry.js";
import { findCommand } from "../../src/commands/registry.js";
import type { Command } from "../../src/commands/types.js";

const pingCommand: Command = {
  name: "ping",
  handle: mock().mockResolvedValue(undefined),
};

const config: CommandRegistryConfig = {
  repositories: {
    "home-assistant/core": [pingCommand],
  },
};

describe("findCommand", () => {
  it("matches repo-level command", () => {
    const cmd = findCommand(config, "home-assistant/core", "ping");
    expect(cmd?.name).toBe("ping");
  });

  it("returns undefined when no command name matches", () => {
    const cmd = findCommand(config, "home-assistant/core", "bogus");
    expect(cmd).toBeUndefined();
  });

  it("returns undefined for unknown repo", () => {
    const cmd = findCommand(config, "unknown/repo", "ping");
    expect(cmd).toBeUndefined();
  });
});
