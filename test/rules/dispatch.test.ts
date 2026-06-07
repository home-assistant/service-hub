import { describe, expect, it, vi } from "vitest";
import { EventType } from "../../src/github/types.js";
import type { RegistryConfig } from "../../src/rules/dispatch.js";
import { dispatch, matchRules } from "../../src/rules/dispatch.js";
import type { Rule } from "../../src/rules/types.js";
import { createMockContext, createMockGitHub } from "../helpers/mock-context.js";

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
          { type: "removeLabels", label: ["needs-rebase"] },
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
          { type: "removeLabels", label: ["keep-me"] },
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

  it("in dry-run, returns effects but does not call GitHub", async () => {
    const github = createMockGitHub();
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const rule: Rule = {
      name: "rule",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          { type: "addLabels", labels: ["bugfix"] },
          { type: "removeLabels", label: ["stale"] },
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
      dryRun: true,
    });

    const effects = await dispatch(config, context);

    expect(effects).toHaveLength(2);
    expect(github.issues.addLabels).not.toHaveBeenCalled();
    expect(github.issues.removeLabel).not.toHaveBeenCalled();
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

  describe("aggregate ha-bot status check from dashboard sections", () => {
    function setupHarness(
      sections: { id: string; status: "pass" | "fail" | "pending" | "skip" }[],
    ) {
      const github = createMockGitHub();
      github.issues.listComments.mockResolvedValue({ data: [] });
      github.paginate.mockImplementation(async () => []);
      github.issues.createComment.mockResolvedValue({
        data: { id: 999, html_url: "https://github.com/ha/c/pull/1#issuecomment-999" },
      });

      const rule: Rule = {
        name: "with-dashboard",
        description: "",
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () =>
            sections.map((s) => ({
              type: "dashboardSection" as const,
              section: { id: s.id, title: s.id, status: s.status, message: s.id },
            })),
        },
      };
      const config: RegistryConfig = {
        organizations: {},
        repositories: { "home-assistant/core": [rule] },
      };
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });
      return { github, config, context };
    }

    it("writes a success ha-bot status when all sections pass", async () => {
      const { github, config, context } = setupHarness([{ id: "a", status: "pass" }]);
      await dispatch(config, context);

      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "ha-bot",
          state: "success",
          target_url: expect.stringContaining("#issuecomment-999"),
        }),
      );
    });

    it("writes a failure ha-bot status when any section fails", async () => {
      const { github, config, context } = setupHarness([
        { id: "a", status: "pass" },
        { id: "b", status: "fail" },
      ]);
      await dispatch(config, context);

      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "ha-bot",
          state: "failure",
          description: expect.stringContaining("1 check failing"),
        }),
      );
    });

    it("counts skipped sections as success and notes them in the description", async () => {
      const { github, config, context } = setupHarness([
        { id: "a", status: "pass" },
        { id: "b", status: "skip" },
        { id: "c", status: "skip" },
      ]);
      await dispatch(config, context);

      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "ha-bot",
          state: "success",
          description: expect.stringContaining("2 skipped"),
        }),
      );
    });

    it("writes a pending ha-bot status when any section is pending", async () => {
      const { github, config, context } = setupHarness([
        { id: "a", status: "fail" },
        { id: "b", status: "pending" },
      ]);
      await dispatch(config, context);

      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "ha-bot",
          state: "pending",
        }),
      );
    });

    it("does not write a ha-bot status if no rule emitted a dashboard section", async () => {
      const github = createMockGitHub();
      const rule: Rule = {
        name: "no-dashboard",
        description: "",
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => [{ type: "addLabels", labels: ["x"] }],
        },
      };
      const config: RegistryConfig = {
        organizations: {},
        repositories: { "home-assistant/core": [rule] },
      };
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });
      await dispatch(config, context);

      expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
    });
  });

  describe("stale-section sweep", () => {
    it("drops sections from the existing comment whose IDs no live rule claims", async () => {
      const github = createMockGitHub();
      // Existing comment has both a known and a stale section
      github.paginate.mockImplementation(async () => [
        {
          id: 555,
          body: [
            "<!-- ha-bot-dashboard -->",
            "<!-- section:still-live:" +
              JSON.stringify({
                id: "still-live",
                title: "Live",
                status: "pass",
                message: "ok",
              }) +
              " -->",
            "<!-- section:gone-rule:" +
              JSON.stringify({
                id: "gone-rule",
                title: "Stale",
                status: "fail",
                message: "should be swept",
              }) +
              " -->",
          ].join("\n"),
        },
      ]);
      github.issues.updateComment.mockResolvedValue({
        data: { id: 555, html_url: "https://github.com/ha/c/pull/1#issuecomment-555" },
      });

      const rule: Rule = {
        name: "live-rule",
        description: "",
        dashboardSections: ["still-live"],
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => [
            {
              type: "dashboardSection",
              section: { id: "still-live", title: "Live", status: "pass", message: "ok" },
            },
          ],
        },
      };
      const config: RegistryConfig = {
        organizations: {},
        repositories: { "home-assistant/core": [rule] },
      };
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

      await dispatch(config, context);

      // Comment was rewritten; new body must not contain the stale section.
      expect(github.issues.updateComment).toHaveBeenCalledTimes(1);
      const writtenBody = github.issues.updateComment.mock.calls[0][0].body as string;
      expect(writtenBody).toContain("still-live");
      expect(writtenBody).not.toContain("gone-rule");

      // ha-bot status reflects only the surviving sections (one pass) → success
      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ context: "ha-bot", state: "success" }),
      );
    });
  });

  describe("stale-status sweep", () => {
    const BOT_LOGIN = "test-bot[bot]";

    function setupStaleStatusHarness(existingStatuses: { context: string; state: string }[]) {
      const github = createMockGitHub();
      github.paginate.mockImplementation(async () => []);
      github.issues.createComment.mockResolvedValue({
        data: { id: 111, html_url: "https://github.com/ha/c/pull/1#issuecomment-111" },
      });
      // listCommitStatusesForRef returns newest-first. We need a prior ha-bot
      // entry so the sweep can identify "our" creator login. Put it first.
      const allStatuses = [
        { context: "ha-bot", state: "success", id: -1, creator: { login: BOT_LOGIN } },
        ...existingStatuses.map((s, idx) => ({
          ...s,
          id: idx,
          creator: { login: BOT_LOGIN },
        })),
      ];
      github.repos.listCommitStatusesForRef.mockResolvedValue({ data: allStatuses });
      const rule: Rule = {
        name: "with-dashboard",
        description: "",
        dashboardSections: ["live"],
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => [
            {
              type: "dashboardSection",
              section: { id: "live", title: "Live", status: "pass", message: "ok" },
            },
          ],
        },
      };
      const config: RegistryConfig = {
        organizations: {},
        repositories: { "home-assistant/core": [rule] },
      };
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });
      return { github, config, context };
    }

    it("neutralizes stale non-ha-bot statuses we wrote", async () => {
      const { github, config, context } = setupStaleStatusHarness([
        { context: "required-labels", state: "failure" },
        { context: "code-owner-approval", state: "failure" },
      ]);

      await dispatch(config, context);

      // ha-bot itself gets re-written (success now) but is NOT neutralized.
      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "required-labels",
          state: "success",
          description: "No longer in use",
        }),
      );
      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "code-owner-approval",
          state: "success",
          description: "No longer in use",
        }),
      );
      // ha-bot got overwritten by the aggregate, not by the sweep.
      const haBotCalls = github.repos.createCommitStatus.mock.calls.filter(
        (call) => call[0].context === "ha-bot",
      );
      expect(haBotCalls).toHaveLength(1);
      expect(haBotCalls[0][0].description).not.toBe("No longer in use");
    });

    it("does not touch statuses created by other users", async () => {
      const github = createMockGitHub();
      github.paginate.mockImplementation(async () => []);
      github.issues.createComment.mockResolvedValue({
        data: { id: 111, html_url: "https://github.com/ha/c/pull/1#issuecomment-111" },
      });
      // Our previous ha-bot status (so the sweep can identify us) plus a
      // status from another bot. The other bot's status must be left alone.
      github.repos.listCommitStatusesForRef.mockResolvedValue({
        data: [
          {
            id: 0,
            context: "ha-bot",
            state: "success",
            creator: { login: BOT_LOGIN },
          },
          {
            id: 1,
            context: "external-ci",
            state: "failure",
            creator: { login: "some-other-bot[bot]" },
          },
        ],
      });
      const rule: Rule = {
        name: "rule",
        description: "",
        dashboardSections: ["live"],
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => [
            {
              type: "dashboardSection",
              section: { id: "live", title: "Live", status: "pass", message: "ok" },
            },
          ],
        },
      };
      const config: RegistryConfig = {
        organizations: {},
        repositories: { "home-assistant/core": [rule] },
      };
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

      await dispatch(config, context);

      const neutralizing = github.repos.createCommitStatus.mock.calls.filter(
        (call) => call[0].description === "No longer in use",
      );
      expect(neutralizing).toHaveLength(0);
    });

    it("skips the sweep on first dispatch (no prior ha-bot status to identify us)", async () => {
      const github = createMockGitHub();
      github.paginate.mockImplementation(async () => []);
      github.issues.createComment.mockResolvedValue({
        data: { id: 111, html_url: "https://github.com/ha/c/pull/1#issuecomment-111" },
      });
      // No ha-bot status in history yet — sweep can't know which login is ours.
      github.repos.listCommitStatusesForRef.mockResolvedValue({
        data: [
          {
            id: 1,
            context: "some-other-bot-status",
            state: "failure",
            creator: { login: "anyone" },
          },
        ],
      });
      const rule: Rule = {
        name: "rule",
        description: "",
        dashboardSections: ["live"],
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => [
            {
              type: "dashboardSection",
              section: { id: "live", title: "Live", status: "pass", message: "ok" },
            },
          ],
        },
      };
      const config: RegistryConfig = {
        organizations: {},
        repositories: { "home-assistant/core": [rule] },
      };
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED, github });

      await dispatch(config, context);

      // ha-bot still written by the aggregate, but nothing neutralized.
      const neutralizing = github.repos.createCommitStatus.mock.calls.filter(
        (call) => call[0].description === "No longer in use",
      );
      expect(neutralizing).toHaveLength(0);
    });

    it("skips statuses already in success state", async () => {
      const { github, config, context } = setupStaleStatusHarness([
        { context: "required-labels", state: "success" },
      ]);
      await dispatch(config, context);

      const neutralizing = github.repos.createCommitStatus.mock.calls.filter(
        (call) => call[0].description === "No longer in use",
      );
      expect(neutralizing).toHaveLength(0);
    });
  });
});
