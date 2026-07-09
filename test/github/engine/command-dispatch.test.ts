import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeLabel } from "../../../src/github/commands/label-remove.js";
import { unassign } from "../../../src/github/commands/unassign.js";
import { isBotCommand, parseCommands } from "../../../src/github/engine/command-context.js";
import { dispatchCommand } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import type { Command, Rule } from "../../../src/github/engine/types.js";
import {
  expectReaction,
  makeCommandContext as makeContext,
  registryWith,
} from "../helpers/command.js";
import { createMockGitHub } from "../helpers/mock-context.js";

const noopCommand = (overrides: Partial<Command> = {}): Command => ({
  name: "ping",
  description: "",
  permission: "none",
  handle: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("parseCommands", () => {
  it("extracts the name and lowercases it", () => {
    expect(parseCommands("/ha-bot UPDATE", "ha-bot")).toEqual([{ name: "update", args: [] }]);
  });

  it("extracts quoted arguments without their quotes", () => {
    expect(parseCommands('/ha-bot rename "Awesome new title"', "ha-bot")).toEqual([
      { name: "rename", args: ["Awesome new title"] },
    ]);
    expect(
      parseCommands('/ha-bot ignore "Merge conflicts" "Broken rule, no conflicts"', "ha-bot"),
    ).toEqual([{ name: "ignore", args: ["Merge conflicts", "Broken rule, no conflicts"] }]);
  });

  it("flags unquoted argument text as malformed", () => {
    expect(parseCommands("/ha-bot rename Awesome new title", "ha-bot")).toEqual([
      { name: "rename", args: [], malformed: true },
    ]);
    expect(parseCommands('/ha-bot ignore "Merge conflicts" trailing', "ha-bot")).toEqual([
      { name: "ignore", args: ["Merge conflicts"], malformed: true },
    ]);
  });

  it("matches on any line of the comment but not mid-line", () => {
    expect(parseCommands("thanks!\n/ha-bot close", "ha-bot")).toEqual([
      { name: "close", args: [] },
    ]);
    expect(parseCommands("see /ha-bot close", "ha-bot")).toEqual([]);
  });

  it("does not swallow following lines into the argument", () => {
    expect(parseCommands('/ha-bot rename "New title"\nmore text', "ha-bot")).toEqual([
      { name: "rename", args: ["New title"] },
    ]);
  });

  it("parses several commands from one comment, in order, with prose between", () => {
    expect(
      parseCommands(
        'looks good!\n/ha-bot rename "New title"\nsome explanation\n/ha-bot close',
        "ha-bot",
      ),
    ).toEqual([
      { name: "rename", args: ["New title"] },
      { name: "close", args: [] },
    ]);
  });

  it("returns an empty list without a command name", () => {
    expect(parseCommands("/ha-bot", "ha-bot")).toEqual([]);
    expect(parseCommands("hello world", "ha-bot")).toEqual([]);
  });
});

describe("isBotCommand", () => {
  it("matches only line-leading mentions", () => {
    expect(isBotCommand("/ha-bot update", "ha-bot")).toBe(true);
    expect(isBotCommand("see /ha-bot below", "ha-bot")).toBe(false);
    expect(isBotCommand("@ha-bot update", "ha-bot")).toBe(false);
  });
});

describe("dispatchCommand", () => {
  it("applies the command's effects and reacts +1", async () => {
    const command = noopCommand({
      handle: vi.fn().mockResolvedValue([{ type: "setState", state: "closed" }]),
    });
    const { context, github } = makeContext("/ha-bot ping", {
      registry: registryWith(command),
    });

    await dispatchCommand(context);

    expect(github.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 1, state: "closed" }),
    );
    expectReaction(github, "+1");
  });

  it("reacts -1 for an unknown command", async () => {
    const { context, github } = makeContext("/ha-bot bogus", {
      registry: registryWith(noopCommand()),
    });

    await dispatchCommand(context);
    expectReaction(github, "-1");
  });

  it("reacts -1 when a required argument is missing", async () => {
    const command = noopCommand({ args: "required" });
    const { context, github } = makeContext("/ha-bot ping", {
      registry: registryWith(command),
    });

    await dispatchCommand(context);
    expect(command.handle).not.toHaveBeenCalled();
    expectReaction(github, "-1");
  });

  it("reacts -1 when a PR-only command targets an issue", async () => {
    const command = noopCommand({ scope: "pull_request" });
    const { context, github } = makeContext("/ha-bot ping", {
      registry: registryWith(command),
      issue: { pull_request: undefined },
    });

    await dispatchCommand(context);
    expect(command.handle).not.toHaveBeenCalled();
    expectReaction(github, "-1");
  });

  it("gates author commands on authorship or org membership", async () => {
    const command = noopCommand({ permission: "author" });
    const github = createMockGitHub();
    github.orgs.checkMembershipForUser.mockRejectedValue({ status: 404 });
    const { context } = makeContext("/ha-bot ping", {
      github,
      registry: registryWith(command),
      sender: { login: "stranger", type: "User" },
    });

    await dispatchCommand(context);
    expect(command.handle).not.toHaveBeenCalled();
    expectReaction(github, "-1");
  });

  it("allows author commands for the non-member author", async () => {
    const command = noopCommand({ permission: "author" });
    const github = createMockGitHub();
    github.orgs.checkMembershipForUser.mockRejectedValue({ status: 404 });
    const { context } = makeContext("/ha-bot ping", {
      github,
      registry: registryWith(command),
    });

    await dispatchCommand(context);
    expect(command.handle).toHaveBeenCalled();
    expectReaction(github, "+1");
  });

  it("allows author commands for org members who are not the author", async () => {
    const command = noopCommand({ permission: "author" });
    const { context, github } = makeContext("/ha-bot ping", {
      registry: registryWith(command),
      sender: { login: "someoneelse", type: "User" },
    });

    await dispatchCommand(context);
    expect(command.handle).toHaveBeenCalled();
    expectReaction(github, "+1");
  });

  it("reacts -1 when the handler throws", async () => {
    const command = noopCommand({ handle: vi.fn().mockRejectedValue(new Error("boom")) });
    const { context, github } = makeContext("/ha-bot ping", {
      registry: registryWith(command),
    });

    await dispatchCommand(context);
    expectReaction(github, "-1");
  });

  it("ignores bot senders entirely", async () => {
    const command = noopCommand();
    const { context, github } = makeContext("/ha-bot ping", {
      registry: registryWith(command),
      sender: { login: "otherbot[bot]", type: "Bot" },
    });

    await dispatchCommand(context);
    expect(command.handle).not.toHaveBeenCalled();
    expect(github.reactions.createForIssueComment).not.toHaveBeenCalled();
  });

  it("runs label-triggered rules on a command's label effects", async () => {
    const onLabeled: Rule = {
      name: "on-labeled",
      description: "",
      events: {
        [EventType.PULL_REQUEST_LABELED]: async (ctx) =>
          ctx.event.label === "foo" ? [{ type: "comment", body: "saw foo" }] : undefined,
      },
    };
    const command = noopCommand({
      handle: vi.fn().mockResolvedValue([{ type: "addLabels", labels: ["foo"] }]),
    });
    const { context, github } = makeContext("/ha-bot ping", {
      registry: registryWith(command, [onLabeled]),
    });

    await dispatchCommand(context);

    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 1, labels: ["foo"] }),
    );
    expect(github.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: "saw foo" }),
    );
    expectReaction(github, "+1");
  });
});

describe("code_owner permission and commands", () => {
  const originalFetch = globalThis.fetch;

  // The unassign handler still reads the integration manifest.
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        domain: "awesome",
        name: "Awesome",
        codeowners: ["@testuser"],
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** A mock GitHub whose CODEOWNERS makes `owner` own `awesome`, membership 404s. */
  function nonMemberGitHub(owner = "@testuser") {
    const github = createMockGitHub();
    github.orgs.checkMembershipForUser.mockRejectedValue({ status: 404 });
    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(`/homeassistant/components/awesome/ ${owner}\n`) },
      headers: {},
    });
    return github;
  }

  it("allows a non-member CODEOWNERS owner of the single labeled integration", async () => {
    const command = noopCommand({ permission: "code_owner" });
    const github = nonMemberGitHub();
    const { context } = makeContext("/ha-bot ping", {
      github,
      registry: registryWith(command),
      issue: { labels: [{ name: "integration: awesome" }] },
    });

    await dispatchCommand(context);
    expect(command.handle).toHaveBeenCalled();
    expectReaction(github, "+1");
  });

  it("allows org members who are not code owners", async () => {
    const command = noopCommand({ permission: "code_owner" });
    const { context, github } = makeContext("/ha-bot ping", {
      registry: registryWith(command),
      sender: { login: "stranger", type: "User" },
    });

    await dispatchCommand(context);
    expect(command.handle).toHaveBeenCalled();
    expectReaction(github, "+1");
  });

  it("answers membership from the comment's MEMBER association without an API call", async () => {
    const command = noopCommand({ permission: "code_owner" });
    const github = createMockGitHub();
    github.orgs.checkMembershipForUser.mockRejectedValue(new Error("must not be called"));
    const { context } = makeContext("/ha-bot ping", {
      github,
      registry: registryWith(command),
      senderAssociation: "MEMBER",
    });

    await dispatchCommand(context);
    expect(command.handle).toHaveBeenCalled();
    expect(github.orgs.checkMembershipForUser).not.toHaveBeenCalled();
    expectReaction(github, "+1");
  });

  it("does not trust an OWNER association (personal repos); the API decides", async () => {
    const command = noopCommand({ permission: "code_owner" });
    const github = nonMemberGitHub("@balloob");
    const { context } = makeContext("/ha-bot ping", {
      github,
      registry: registryWith(command),
      issue: { labels: [{ name: "integration: awesome" }] },
      senderAssociation: "OWNER",
    });

    await dispatchCommand(context);
    expect(command.handle).not.toHaveBeenCalled();
    expectReaction(github, "-1");
  });

  it("denies non-member non-code-owners and unlabeled items", async () => {
    const command = noopCommand({ permission: "code_owner" });
    const g1 = nonMemberGitHub();
    const { context: noLabel } = makeContext("/ha-bot ping", {
      github: g1,
      registry: registryWith(command),
    });
    await dispatchCommand(noLabel);
    expectReaction(g1, "-1");

    const g2 = nonMemberGitHub("@balloob");
    const { context: wrongUser } = makeContext("/ha-bot ping", {
      github: g2,
      registry: registryWith(command),
      issue: { labels: [{ name: "integration: awesome" }] },
      sender: { login: "stranger", type: "User" },
    });
    await dispatchCommand(wrongUser);
    expectReaction(g2, "-1");
  });

  it("unassign removes the integration label and its code-owner assignees", async () => {
    const { context, github } = makeContext('/ha-bot unassign "awesome"', {
      registry: registryWith(unassign),
      issue: {
        labels: [{ name: "integration: awesome" }],
        assignees: [{ login: "testuser" }, { login: "someoneelse" }],
      },
    });

    await dispatchCommand(context);

    expect(github.issues.removeLabel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "integration: awesome" }),
    );
    expect(github.issues.removeAssignees).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: ["testuser"] }),
    );
    expectReaction(github, "+1");
  });

  it("remove-label rejects labels that are not set", async () => {
    const command = removeLabel(["needs-more-information"]);
    const { context, github } = makeContext('/ha-bot remove-label "needs-more-information"', {
      registry: registryWith(command),
      issue: { labels: [{ name: "integration: awesome" }] },
    });

    await dispatchCommand(context);
    expectReaction(github, "-1");
  });
});
