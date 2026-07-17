import type { Octokit } from "@octokit/rest";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { expect } from "vitest";
import type { RegistryConfig } from "../../../src/github/engine/dispatch.js";
import type { CommandContext } from "../../../src/github/engine/model/command-context.js";
import { commandContextFromWebhook } from "../../../src/github/engine/model/from-webhook.js";
import type { Command, Rule } from "../../../src/github/engine/types.js";
import { createMockGitHub, type MockGitHub, testEnv } from "./mock-context.js";

export interface MakeCommandContextOptions {
  github?: MockGitHub;
  registry?: RegistryConfig;
  issue?: Record<string, unknown>;
  sender?: { login: string; type: string };
  /** The comment's author_association; NONE unless a test says otherwise. */
  senderAssociation?: string;
}

export function makeCommandContext(
  body: string,
  options: MakeCommandContextOptions = {},
): { context: CommandContext; github: MockGitHub } {
  const github = options.github ?? createMockGitHub();
  const payload = {
    action: "created",
    sender: options.sender ?? { login: "testuser", type: "User" },
    repository: {
      full_name: "home-assistant/core",
      name: "core",
      owner: { login: "home-assistant" },
    },
    issue: {
      number: 1,
      pull_request: { url: "https://api.github.com/repos/home-assistant/core/pulls/1" },
      user: { login: "testuser" },
      body: "",
      labels: [] as { name: string }[],
      assignees: [] as { login: string }[],
      ...options.issue,
    },
    comment: {
      id: 42,
      body,
      user: { login: "testuser" },
      author_association: options.senderAssociation ?? "NONE",
    },
  };
  const context = commandContextFromWebhook(
    testEnv,
    options.registry ?? { repositories: {} },
    github as unknown as Octokit,
    payload as unknown as IssueCommentCreatedEvent,
  );
  return { context, github };
}

export function registryWith(command: Command, rules: Rule[] = []): RegistryConfig {
  return {
    repositories: { "home-assistant/core": rules },
    commands: { "home-assistant/core": [command] },
    integrationPaths: {
      "home-assistant/core": (domain) => `homeassistant/components/${domain}/*`,
    },
  };
}

export function expectReaction(github: MockGitHub, content: "+1" | "-1") {
  expect(github.reactions.createForIssueComment).toHaveBeenCalledWith(
    expect.objectContaining({ comment_id: 42, content }),
  );
}
