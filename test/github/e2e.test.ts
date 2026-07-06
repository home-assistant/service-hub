import { describe, expect, it, mock } from "bun:test";
import type { CommandContext } from "../../src/github/engine/command-context.js";
import { EventType } from "../../src/github/engine/event.js";
import type { Command, Rule } from "../../src/github/engine/types.js";
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
      config: {
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
      config: {
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
      config: {
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

  it("returns 200 and runs no rules for an unknown event type", async () => {
    const labelRule: Rule = {
      name: "should-not-fire",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [{ type: "addLabels", labels: ["never"] }],
      },
    };
    const harness = createE2EHarness({
      config: {
        repositories: { "home-assistant/core": [labelRule] },
      },
    });

    // pull_request.assigned isn't in our EventType enum; should bail.
    const res = await harness.deliver("pull_request", {
      ...prOpenedPayload(),
      action: "assigned",
    });

    expect(res.status).toBe(200);
    expect(harness.github.issues.addLabels).not.toHaveBeenCalled();
  });
});

describe("e2e: bot commands", () => {
  const pingCommand = (handle: Command["handle"]): Command => ({
    name: "ping",
    description: "",
    permission: "none",
    handle,
  });

  it("runs a matched /ha-bot command, applies its effects, and posts a +1 reaction", async () => {
    const handle = mock().mockResolvedValue([{ type: "setTitle", title: "pinged" }]);

    const harness = createE2EHarness({
      config: {
        repositories: {},
        commands: { "home-assistant/core": [pingCommand(handle)] },
      },
    });

    const res = await harness.deliver("issue_comment", commentPayload("/ha-bot ping"));

    expect(res.status).toBe(200);
    const context = handle.mock.calls[0][0] as CommandContext;
    expect(context.repository).toBe("home-assistant/core");
    expect(context.number).toBe(1);
    expect(context.target.kind).toBe("pull_request");
    expect(harness.github.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 1, title: "pinged" }),
    );
    expect(harness.github.reactions.createForIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 42, content: "+1" }),
    );
  });

  it("runs commands on plain issue comments too", async () => {
    const handle = mock().mockResolvedValue(undefined);

    const harness = createE2EHarness({
      config: {
        repositories: {},
        commands: { "home-assistant/core": [pingCommand(handle)] },
      },
    });

    const res = await harness.deliver(
      "issue_comment",
      commentPayload("/ha-bot ping", {
        issue: { number: 5, user: { login: "testuser" }, body: "" }, // no pull_request
      }),
    );

    expect(res.status).toBe(200);
    const context = handle.mock.calls[0][0] as CommandContext;
    expect(context.number).toBe(5);
    expect(context.target.kind).toBe("issue");
    expect(harness.github.reactions.createForIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 42, content: "+1" }),
    );
  });

  it("posts a -1 reaction when the command is unknown", async () => {
    const harness = createE2EHarness({
      config: {
        repositories: {},
        commands: { "home-assistant/core": [pingCommand(mock())] },
      },
    });

    await harness.deliver("issue_comment", commentPayload("/ha-bot nonsense"));

    expect(harness.github.reactions.createForIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 42, content: "-1" }),
    );
  });

  it("ignores comments without a bot mention and falls through to the issue path (no PR)", async () => {
    const handle = mock();

    const harness = createE2EHarness({
      config: {
        repositories: {},
        commands: { "home-assistant/core": [pingCommand(handle)] },
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
