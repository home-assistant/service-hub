import { describe, expect, it, vi } from "vitest";
import { EventType } from "../../src/github/types.js";
import type { RegistryConfig } from "../../src/rules/dispatch.js";
import { dispatch, matchRules } from "../../src/rules/dispatch.js";
import type { Rule } from "../../src/rules/types.js";
import { createMockContext, createMockDb, createMockGitHub } from "../helpers/mock-context.js";

const testRule: Rule = {
  name: "test-rule",
  description: "",
  events: { [EventType.PULL_REQUEST_OPENED]: async () => undefined },
};

const noBotRule: Rule = {
  name: "no-bot-rule",
  description: "",
  allowBots: false,
  events: { [EventType.PULL_REQUEST_OPENED]: async () => undefined },
};

const orgRule: Rule = {
  name: "org-rule",
  description: "",
  events: { [EventType.PULL_REQUEST_OPENED]: async () => undefined },
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
      description: "",
      events: { [EventType.PULL_REQUEST_OPENED]: async () => undefined },
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

describe("dispatch", () => {
  it("adds labels from rule effects", async () => {
    const github = createMockGitHub();
    const labelRule: Rule = {
      name: "labeler",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          { type: "addLabels", labels: ["bugfix", "has-tests"] },
        ],
      },
    };

    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [labelRule] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

    await dispatch(config, context);

    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["bugfix", "has-tests"] }),
    );
  });

  it("removes labels from rule effects", async () => {
    const github = createMockGitHub();
    const removerRule: Rule = {
      name: "remover",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          { type: "removeLabel", label: "needs-rebase" },
        ],
      },
    };

    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [removerRule] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

    await dispatch(config, context);

    expect(github.issues.removeLabel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "needs-rebase" }),
    );
  });

  it("does not remove a label that was also added", async () => {
    const github = createMockGitHub();
    const conflictRule: Rule = {
      name: "conflict",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          { type: "addLabels", labels: ["keep-me"] },
          { type: "removeLabel", label: "keep-me" },
        ],
      },
    };

    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [conflictRule] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

    await dispatch(config, context);

    expect(github.issues.addLabels).toHaveBeenCalled();
    expect(github.issues.removeLabel).not.toHaveBeenCalled();
  });

  it("creates status checks from rule effects", async () => {
    const github = createMockGitHub();
    const statusRule: Rule = {
      name: "status-checker",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          {
            type: "statusCheck",
            sha: "abc123",
            context: "ci/test",
            state: "success",
            description: "All tests passed",
          },
        ],
      },
    };

    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [statusRule] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

    await dispatch(config, context);

    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "ci/test",
        state: "success",
        description: "All tests passed",
      }),
    );
  });

  it("dedupes status checks by (sha, context) — last effect wins", async () => {
    const github = createMockGitHub();
    const rule1: Rule = {
      name: "rule1",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          {
            type: "statusCheck",
            sha: "abc123",
            context: "ci/test",
            state: "pending",
            description: "from rule1",
          },
        ],
      },
    };
    const rule2: Rule = {
      name: "rule2",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          {
            type: "statusCheck",
            sha: "abc123",
            context: "ci/test",
            state: "success",
            description: "from rule2",
          },
          {
            type: "statusCheck",
            sha: "abc123",
            context: "ci/other",
            state: "success",
            description: "different context",
          },
        ],
      },
    };

    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [rule1, rule2] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

    await dispatch(config, context);

    expect(github.repos.createCommitStatus).toHaveBeenCalledTimes(2);
    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        sha: "abc123",
        context: "ci/test",
        state: "success",
        description: "from rule2",
      }),
    );
    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ sha: "abc123", context: "ci/other" }),
    );
  });

  it("creates comments from rule effects", async () => {
    const github = createMockGitHub();
    const commentRule: Rule = {
      name: "commenter",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          { type: "comment", body: "Hello from the bot!" },
        ],
      },
    };

    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [commentRule] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

    await dispatch(config, context);

    expect(github.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Hello from the bot!" }),
    );
  });

  it("creates review requests from requestChanges effect", async () => {
    const github = createMockGitHub();
    const reviewRule: Rule = {
      name: "reviewer",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          { type: "requestChanges", body: "Please fix this." },
        ],
      },
    };

    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [reviewRule] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

    await dispatch(config, context);

    expect(github.pulls.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ event: "REQUEST_CHANGES", body: "Please fix this." }),
    );
  });

  it("adds assignees from rule effects", async () => {
    const github = createMockGitHub();
    const assignRule: Rule = {
      name: "assigner",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          { type: "addAssignees", assignees: ["balloob", "frenck"] },
        ],
      },
    };

    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [assignRule] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

    await dispatch(config, context);

    expect(github.issues.addAssignees).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: ["balloob", "frenck"] }),
    );
  });

  it("continues processing when a rule throws", async () => {
    const github = createMockGitHub();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const failingRule: Rule = {
      name: "failing",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => {
          throw new Error("Rule exploded");
        },
      },
    };
    const succeedingRule: Rule = {
      name: "succeeding",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          { type: "addLabels", labels: ["still-works"] },
        ],
      },
    };

    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [failingRule, succeedingRule] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

    await dispatch(config, context);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("failing"),
      expect.any(Error),
    );
    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["still-works"] }),
    );

    consoleErrorSpy.mockRestore();
  });

  it("in dry-run, returns effects but does not call GitHub or DB", async () => {
    const github = createMockGitHub();
    const db = createMockDb();
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const rule: Rule = {
      name: "rule",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          { type: "addLabels", labels: ["bugfix"] },
          {
            type: "statusCheck",
            sha: "abc",
            context: "ci/test",
            state: "success",
            description: "ok",
          },
          { type: "dbExecute", sql: "INSERT INTO x VALUES (?)", params: ["v"] },
        ],
      },
    };

    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [rule] },
    };
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      db,
      dryRun: true,
    });

    const effects = await dispatch(config, context);

    expect(effects).toHaveLength(3);
    expect(github.issues.addLabels).not.toHaveBeenCalled();
    expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it("does nothing when no rules match", async () => {
    const github = createMockGitHub();
    const config: RegistryConfig = {
      organizations: {},
      repositories: {},
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

    await dispatch(config, context);

    expect(github.issues.addLabels).not.toHaveBeenCalled();
    expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
  });

  it("merges effects from multiple rules", async () => {
    const github = createMockGitHub();
    const rule1: Rule = {
      name: "rule1",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [{ type: "addLabels", labels: ["label-a"] }],
      },
    };
    const rule2: Rule = {
      name: "rule2",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [{ type: "addLabels", labels: ["label-b"] }],
      },
    };

    const config: RegistryConfig = {
      organizations: {},
      repositories: { "home-assistant/core": [rule1, rule2] },
    };
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

    await dispatch(config, context);

    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: expect.arrayContaining(["label-a", "label-b"]) }),
    );
  });
});
