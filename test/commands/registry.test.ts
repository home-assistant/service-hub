import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import type { CommandRegistryConfig } from "../../src/commands/registry.js";
import { dispatchCommand, findCommand } from "../../src/commands/registry.js";
import type { Command, CommandContext } from "../../src/commands/types.js";
import { createMockDb, createMockGitHub } from "../helpers/mock-context.js";

const echoCommand: Command = {
  name: "echo",
  pattern: /^@ha-bot\s+echo\s*$/im,
  handle: vi.fn().mockResolvedValue(undefined),
};

const pingCommand: Command = {
  name: "ping",
  pattern: /^@ha-bot\s+ping\s*$/im,
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
    const cmd = findCommand(config, "home-assistant/frontend", "home-assistant", "@ha-bot echo");
    expect(cmd?.name).toBe("echo");
  });

  it("matches repo-level command", () => {
    const cmd = findCommand(config, "home-assistant/core", "home-assistant", "@ha-bot ping");
    expect(cmd?.name).toBe("ping");
  });

  it("returns undefined when no command matches", () => {
    const cmd = findCommand(config, "home-assistant/core", "home-assistant", "hello world");
    expect(cmd).toBeUndefined();
  });

  it("returns undefined for unknown org/repo", () => {
    const cmd = findCommand(config, "unknown/repo", "unknown", "@ha-bot echo");
    expect(cmd).toBeUndefined();
  });

  it("deduplicates commands with the same name (repo takes priority)", () => {
    const sharedCmd: Command = {
      name: "shared",
      pattern: /^@ha-bot\s+shared\s*$/im,
      handle: vi.fn().mockResolvedValue(undefined),
    };
    const dupConfig: CommandRegistryConfig = {
      organizations: { "home-assistant": [sharedCmd] },
      repositories: { "home-assistant/core": [sharedCmd] },
    };

    const cmd = findCommand(dupConfig, "home-assistant/core", "home-assistant", "@ha-bot shared");
    expect(cmd?.name).toBe("shared");
  });
});

describe("dispatchCommand", () => {
  it("executes matched command and reacts with thumbs up", async () => {
    const github = createMockGitHub();
    const db = createMockDb();

    const context: CommandContext = {
      github: github as unknown as Octokit,
      db,
      owner: "home-assistant",
      repo: "core",
      issueNumber: 1,
      commentId: 100,
      commentBody: "@ha-bot ping",
      senderLogin: "testuser",
    };

    const result = await dispatchCommand(config, context);
    expect(result).toBe(true);
    expect(pingCommand.handle).toHaveBeenCalledWith(context);
    expect(github.reactions.createForIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 100,
        content: "+1",
      }),
    );
  });

  it("returns false when no command matches", async () => {
    const github = createMockGitHub();
    const db = createMockDb();

    const context: CommandContext = {
      github: github as unknown as Octokit,
      db,
      owner: "home-assistant",
      repo: "core",
      issueNumber: 1,
      commentId: 100,
      commentBody: "just a regular comment",
      senderLogin: "testuser",
    };

    const result = await dispatchCommand(config, context);
    expect(result).toBe(false);
  });
});
