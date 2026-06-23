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
  repositories: {
    "home-assistant/core": [pingCommand],
  },
};

describe("isBotCommand", () => {
  it("matches comments starting with /<slug>", () => {
    expect(isBotCommand("/ha-bot update", "ha-bot")).toBe(true);
    expect(isBotCommand("/ha-bot bogus", "ha-bot")).toBe(true);
  });

  it("does not match comments without the slash prefix", () => {
    expect(isBotCommand("just a regular comment", "ha-bot")).toBe(false);
    expect(isBotCommand("see /ha-bot below", "ha-bot")).toBe(false);
    expect(isBotCommand("@ha-bot update", "ha-bot")).toBe(false);
  });

  it("respects a different slug", () => {
    expect(isBotCommand("/home-assistant-bot-test update", "home-assistant-bot-test")).toBe(true);
    expect(isBotCommand("/ha-bot update", "home-assistant-bot-test")).toBe(false);
  });
});

describe("getBotCommand", () => {
  it("extracts the command name after the slug", () => {
    expect(getBotCommand("/ha-bot update", "ha-bot")).toBe("update");
  });

  it("lowercases the extracted name", () => {
    expect(getBotCommand("/ha-bot UPDATE", "ha-bot")).toBe("update");
  });

  it("returns undefined when the line has trailing arguments", () => {
    expect(getBotCommand("/ha-bot update now", "ha-bot")).toBeUndefined();
  });

  it("returns undefined when there is no slash command", () => {
    expect(getBotCommand("hello world", "ha-bot")).toBeUndefined();
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
      commentBody: "/ha-bot ping",
      senderLogin: "testuser",
      botSlug: "ha-bot",
    };

    await dispatchCommand(config, context, "ha-bot");
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
      commentBody: "/ha-bot bogus",
      senderLogin: "testuser",
      botSlug: "ha-bot",
    };

    await dispatchCommand(config, context, "ha-bot");
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
      commentBody: "/ha-bot ping",
      senderLogin: "testuser",
      botSlug: "ha-bot",
    };

    await dispatchCommand(config, context, "ha-bot");
    expect(github.reactions.createForIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 100,
        content: "-1",
      }),
    );
  });
});
