import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { dispatchCommand, getBotCommand, isBotCommand } from "../../src/commands/dispatch.js";
import type { CommandRegistryConfig } from "../../src/commands/registry.js";
import type { Command, CommandContext } from "../../src/commands/types.js";
import { createMockGitHub } from "../helpers/mock-context.js";

const pingCommand: Command = {
  name: "ping",
  handle: vi.fn().mockResolvedValue(undefined),
};

const config: CommandRegistryConfig = {
  organizations: {},
  repositories: {
    "home-assistant/core": [pingCommand],
  },
};

describe("isBotCommand", () => {
  it("matches comments mentioning @ha-bot", () => {
    expect(isBotCommand("@ha-bot update")).toBe(true);
    expect(isBotCommand("@ha-bot bogus")).toBe(true);
  });

  it("does not match comments without a bot mention", () => {
    expect(isBotCommand("just a regular comment")).toBe(false);
    expect(isBotCommand("see @ha-bot below")).toBe(false);
  });
});

describe("getBotCommand", () => {
  it("extracts the command name after the bot mention", () => {
    expect(getBotCommand("@ha-bot update")).toBe("update");
  });

  it("lowercases the extracted name", () => {
    expect(getBotCommand("@ha-bot UPDATE")).toBe("update");
  });

  it("returns undefined when the line has trailing arguments", () => {
    expect(getBotCommand("@ha-bot update now")).toBeUndefined();
  });

  it("returns undefined when there is no bot mention", () => {
    expect(getBotCommand("hello world")).toBeUndefined();
  });
});

describe("dispatchCommand", () => {
  it("executes matched command and reacts with thumbs up", async () => {
    const github = createMockGitHub();

    const context: CommandContext = {
      github: github as unknown as Octokit,
      owner: "home-assistant",
      repo: "core",
      issueNumber: 1,
      commentId: 100,
      commentBody: "@ha-bot ping",
      senderLogin: "testuser",
    };

    await dispatchCommand(config, context);
    expect(pingCommand.handle).toHaveBeenCalledWith(context);
    expect(github.reactions.createForIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 100,
        content: "+1",
      }),
    );
  });

  it("reacts with thumbs-down for unknown command", async () => {
    const github = createMockGitHub();

    const context: CommandContext = {
      github: github as unknown as Octokit,
      owner: "home-assistant",
      repo: "core",
      issueNumber: 1,
      commentId: 100,
      commentBody: "@ha-bot bogus",
      senderLogin: "testuser",
    };

    await dispatchCommand(config, context);
    expect(github.reactions.createForIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 100,
        content: "-1",
      }),
    );
  });

  it("reacts with thumbs-down when org/repo has no access", async () => {
    const github = createMockGitHub();

    const context: CommandContext = {
      github: github as unknown as Octokit,
      owner: "unknown",
      repo: "repo",
      issueNumber: 1,
      commentId: 100,
      commentBody: "@ha-bot ping",
      senderLogin: "testuser",
    };

    await dispatchCommand(config, context);
    expect(github.reactions.createForIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 100,
        content: "-1",
      }),
    );
  });
});
