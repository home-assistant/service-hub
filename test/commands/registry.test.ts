import { describe, expect, it, vi } from "vitest";
import type { CommandRegistryConfig } from "../../src/commands/registry.js";
import { findCommand } from "../../src/commands/registry.js";
import type { Command } from "../../src/commands/types.js";

const echoCommand: Command = {
  name: "echo",
  handle: vi.fn().mockResolvedValue(undefined),
};

const pingCommand: Command = {
  name: "ping",
  handle: vi.fn().mockResolvedValue(undefined),
};

const config: CommandRegistryConfig = {
  organizations: {
    "home-assistant": [echoCommand],
  },
  repositories: {
    "home-assistant/core": [pingCommand],
  },
};

describe("findCommand", () => {
  it("matches org-level command", () => {
    const cmd = findCommand(config, "home-assistant/frontend", "home-assistant", "echo");
    expect(cmd?.name).toBe("echo");
  });

  it("matches repo-level command", () => {
    const cmd = findCommand(config, "home-assistant/core", "home-assistant", "ping");
    expect(cmd?.name).toBe("ping");
  });

  it("returns undefined when no command name matches", () => {
    const cmd = findCommand(config, "home-assistant/core", "home-assistant", "bogus");
    expect(cmd).toBeUndefined();
  });

  it("returns undefined for unknown org/repo", () => {
    const cmd = findCommand(config, "unknown/repo", "unknown", "echo");
    expect(cmd).toBeUndefined();
  });

  it("deduplicates commands with the same name (repo takes priority)", () => {
    const sharedCmd: Command = {
      name: "shared",
      handle: vi.fn().mockResolvedValue(undefined),
    };
    const dupConfig: CommandRegistryConfig = {
      organizations: { "home-assistant": [sharedCmd] },
      repositories: { "home-assistant/core": [sharedCmd] },
    };

    const cmd = findCommand(dupConfig, "home-assistant/core", "home-assistant", "shared");
    expect(cmd?.name).toBe("shared");
  });
});
