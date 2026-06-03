import { describe, expect, it, vi } from "vitest";
import type { Command } from "../src/commands/types.js";
import { EventType } from "../src/github/types.js";
import type { Rule } from "../src/rules/types.js";
import { commentPayload, createE2EHarness, prOpenedPayload } from "./helpers/e2e.js";

describe("e2e: webhook delivery", () => {
  it("runs a matching PR rule and applies its effects through the dispatcher", async () => {
    const labelOnOpen: Rule = {
      name: "label-on-open",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [{ type: "addLabels", labels: ["e2e-test"] }],
      },
    };

    const harness = createE2EHarness({
      prConfig: {
        organizations: {},
        repositories: { "home-assistant/core": [labelOnOpen] },
      },
    });

    const res = await harness.deliver("pull_request", prOpenedPayload());

    expect(res.status).toBe(200);
    expect(harness.github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "home-assistant",
        repo: "core",
        issue_number: 1,
        labels: ["e2e-test"],
      }),
    );
  });

  it("dedupes status checks from two rules emitting the same (sha, context)", async () => {
    const ruleA: Rule = {
      name: "rule-a",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          {
            type: "statusCheck",
            sha: "abc123",
            context: "ci/check",
            state: "pending",
            description: "from A",
          },
        ],
      },
    };
    const ruleB: Rule = {
      name: "rule-b",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          {
            type: "statusCheck",
            sha: "abc123",
            context: "ci/check",
            state: "success",
            description: "from B",
          },
        ],
      },
    };

    const harness = createE2EHarness({
      prConfig: {
        organizations: {},
        repositories: { "home-assistant/core": [ruleA, ruleB] },
      },
    });

    await harness.deliver("pull_request", prOpenedPayload());

    expect(harness.github.repos.createCommitStatus).toHaveBeenCalledTimes(1);
    expect(harness.github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ context: "ci/check", state: "success", description: "from B" }),
    );
  });

  it("rejects a webhook with a bad signature", async () => {
    const labelOnOpen: Rule = {
      name: "label-on-open",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          { type: "addLabels", labels: ["should-not-fire"] },
        ],
      },
    };

    const harness = createE2EHarness({
      prConfig: {
        organizations: {},
        repositories: { "home-assistant/core": [labelOnOpen] },
      },
    });

    const res = await harness.deliverUnsigned("pull_request", prOpenedPayload());

    expect(res.status).toBe(401);
    expect(harness.github.issues.addLabels).not.toHaveBeenCalled();
  });

  it("dispatches an issue rule for issues.opened events", async () => {
    const labelIssue: Rule = {
      name: "label-issue",
      description: "",
      events: {
        [EventType.ISSUES_OPENED]: async () => [{ type: "addLabels", labels: ["triage"] }],
      },
    };

    const harness = createE2EHarness({
      issueConfig: {
        organizations: {},
        repositories: { "home-assistant/core": [labelIssue] },
      },
    });

    const res = await harness.deliver("issues", {
      action: "opened",
      sender: { login: "testuser", type: "User" },
      repository: {
        full_name: "home-assistant/core",
        name: "core",
        owner: { login: "home-assistant" },
      },
      issue: {
        number: 7,
        body: "",
        user: { login: "testuser" },
        assignees: [],
        labels: [],
      },
    });

    expect(res.status).toBe(200);
    expect(harness.github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 7, labels: ["triage"] }),
    );
  });
});

describe("e2e: bot commands", () => {
  it("runs a matched @ha-bot command and posts a +1 reaction", async () => {
    const handle = vi.fn().mockResolvedValue(undefined);
    const ping: Command = { name: "ping", handle };

    const harness = createE2EHarness({
      commandConfig: {
        organizations: {},
        repositories: { "home-assistant/core": [ping] },
      },
    });

    const res = await harness.deliver("issue_comment", commentPayload("@ha-bot ping"));

    expect(res.status).toBe(200);
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "home-assistant", repo: "core", issueNumber: 1 }),
    );
    expect(harness.github.reactions.createForIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 42, content: "+1" }),
    );
  });

  it("posts a -1 reaction when the command is unknown", async () => {
    const harness = createE2EHarness({
      commandConfig: {
        organizations: {},
        repositories: { "home-assistant/core": [{ name: "ping", handle: vi.fn() }] },
      },
    });

    await harness.deliver("issue_comment", commentPayload("@ha-bot nonsense"));

    expect(harness.github.reactions.createForIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 42, content: "-1" }),
    );
  });

  it("ignores comments without a bot mention and falls through to the issue path (no PR)", async () => {
    const handle = vi.fn();

    const harness = createE2EHarness({
      commandConfig: {
        organizations: {},
        repositories: { "home-assistant/core": [{ name: "ping", handle }] },
      },
    });

    const res = await harness.deliver(
      "issue_comment",
      commentPayload("just a normal comment", {
        issue: { number: 1, user: { login: "testuser" }, body: "" }, // no pull_request
      }),
    );

    expect(res.status).toBe(200);
    expect(handle).not.toHaveBeenCalled();
    expect(harness.github.reactions.createForIssueComment).not.toHaveBeenCalled();
  });
});
