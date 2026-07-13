import { describe, expect, it, vi } from "vitest";
import type { RegistryConfig } from "../../../src/github/engine/dispatch.js";
import { dispatch, matchRules } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import type { Rule } from "../../../src/github/engine/types.js";
import { log } from "../../../src/log.js";
import {
  createMockContext,
  createMockGitHub,
  createMockIssueContext,
} from "../helpers/mock-context.js";

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

describe("matchRules", () => {
  it("matches repo rule with correct event type", () => {
    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [testRule] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
    });
    const matched = matchRules(context);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe("test-rule");
  });

  it("does not match rule with wrong event type", () => {
    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [testRule] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_CLOSED,
    });
    const matched = matchRules(context);
    expect(matched).toHaveLength(0);
  });

  it("does not match rule for different repo", () => {
    const config: RegistryConfig = {
      repositories: { "home-assistant/frontend": [testRule] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
    });
    const matched = matchRules(context);
    expect(matched).toHaveLength(0);
  });

  it("filters out bots when allowBots is false", () => {
    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [noBotRule] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: { sender: { login: "dependabot[bot]", type: "Bot" } },
    });
    const matched = matchRules(context);
    expect(matched).toHaveLength(0);
  });

  it("allows bots by default", () => {
    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [testRule] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: { sender: { login: "dependabot[bot]", type: "Bot" } },
    });
    const matched = matchRules(context);
    expect(matched).toHaveLength(1);
  });

  it("returns empty for unknown repo/org", () => {
    const config: RegistryConfig = {
      repositories: {},
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
    });
    const matched = matchRules(context);
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
      repositories: { "home-assistant/core": [labelRule] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

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
          { type: "removeLabels", labels: ["needs-rebase"] },
        ],
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [removerRule] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      payload: { pull_request: { labels: [{ name: "needs-rebase" }] } },
    });

    await dispatch(context);

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
          { type: "removeLabels", labels: ["keep-me"] },
        ],
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [conflictRule] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

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
      repositories: { "home-assistant/core": [commentRule] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

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
      repositories: { "home-assistant/core": [assignRule] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.addAssignees).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: ["balloob", "frenck"] }),
    );
  });

  it("continues processing when a rule throws", async () => {
    const github = createMockGitHub();
    const logExceptionSpy = vi.spyOn(log, "exception").mockImplementation(() => {});

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
      repositories: { "home-assistant/core": [failingRule, succeedingRule] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(logExceptionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Rule exploded" }),
      expect.objectContaining({ rule: "failing" }),
    );
    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["still-works"] }),
    );

    logExceptionSpy.mockRestore();
  });

  it("does nothing when no rules match", async () => {
    const github = createMockGitHub();
    const config: RegistryConfig = {
      repositories: {},
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

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
      repositories: { "home-assistant/core": [rule1, rule2] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: expect.arrayContaining(["label-a", "label-b"]) }),
    );
  });

  // The aggregate ha-bot status check written from dashboard sections is
  // covered per-effect in apply-effects.test.ts.

  describe("draft-on-failure", () => {
    function setupDraftHarness(
      sectionStatus: "fail" | "pass" | "pending",
      prData: { draft?: boolean; node_id?: string } = {},
    ) {
      const github = createMockGitHub();
      github.paginate.mockImplementation(async () => []);
      github.issues.createComment.mockResolvedValue({
        data: { id: 999, html_url: "https://github.com/ha/c/pull/1#issuecomment-999" },
      });

      const rule: Rule = {
        name: "rule",
        description: "",
        statusSections: [{ id: "x", title: "x" }],
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => [
            {
              type: "statusSection",
              section: { id: "x", title: "x", status: sectionStatus, message: "msg" },
            },
          ],
        },
      };
      const config: RegistryConfig = {
        repositories: { "home-assistant/core": [rule] },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        payload: {
          pull_request: { draft: prData.draft ?? false, node_id: prData.node_id ?? "PR_NODE_1" },
        },
      });
      return { github, context };
    }

    it("converts the PR to draft when the aggregate is failing", async () => {
      const { github, context } = setupDraftHarness("fail");
      await dispatch(context);

      expect(github.graphql).toHaveBeenCalledWith(
        expect.stringContaining("convertPullRequestToDraft"),
        expect.objectContaining({ id: "PR_NODE_1" }),
      );
    });

    it("does not draft when the PR is already a draft", async () => {
      const { github, context } = setupDraftHarness("fail", { draft: true });
      await dispatch(context);

      expect(github.graphql).not.toHaveBeenCalled();
    });

    it("does not draft when the aggregate is passing", async () => {
      const { github, context } = setupDraftHarness("pass");
      await dispatch(context);

      expect(github.graphql).not.toHaveBeenCalled();
    });

    it("does not draft when the aggregate is pending", async () => {
      const { github, context } = setupDraftHarness("pending");
      await dispatch(context);

      expect(github.graphql).not.toHaveBeenCalled();
    });

    function dashboardComment(status: "fail" | "pending" | "pass") {
      const section = { id: "x", title: "x", status, message: "msg" };
      return {
        id: 1,
        body: `<!-- ha-bot-dashboard -->\n<!-- section:x:${JSON.stringify(section)} -->`,
      };
    }

    it("on ready_for_review with a failing dashboard section, drafts immediately", async () => {
      const github = createMockGitHub();
      github.paginate.mockImplementation(async () => [dashboardComment("fail")]);

      const config: RegistryConfig = { repositories: {} };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        github,
        payload: { pull_request: { draft: false, node_id: "PR_NODE_READY" } },
      });

      await dispatch(context);

      expect(github.graphql).toHaveBeenCalledWith(
        expect.stringContaining("convertPullRequestToDraft"),
        expect.objectContaining({ id: "PR_NODE_READY" }),
      );
    });

    it("on ready_for_review with only a pending dashboard section, does not draft", async () => {
      const github = createMockGitHub();
      github.paginate.mockImplementation(async () => [dashboardComment("pending")]);

      const config: RegistryConfig = { repositories: {} };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        github,
      });

      await dispatch(context);

      expect(github.graphql).not.toHaveBeenCalled();
    });

    it("on ready_for_review with no dashboard comment yet, does not draft", async () => {
      const github = createMockGitHub();
      github.paginate.mockImplementation(async () => []);

      const config: RegistryConfig = { repositories: {} };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        github,
      });

      await dispatch(context);

      expect(github.graphql).not.toHaveBeenCalled();
    });
  });

  describe("section waivers persisted in the status comment", () => {
    const waivedFailing = {
      id: "merge-conflict",
      title: "Merge conflicts",
      status: "fail",
      message: "Branch has merge conflicts.",
      ignored: { reason: "Will rebase before merge" },
    };

    function setupWaivedHarness(reEmit: { status: "fail" | "pass"; message: string } | null) {
      const github = createMockGitHub();
      // Existing comment carries a waived failing section.
      github.paginate.mockImplementation(async () => [
        {
          id: 555,
          body: [
            "<!-- ha-bot-dashboard -->",
            `<!-- section:merge-conflict:${JSON.stringify(waivedFailing)} -->`,
            `<!-- section:other:${JSON.stringify({
              id: "other",
              title: "Other",
              status: "pass",
              message: "ok",
            })} -->`,
          ].join("\n"),
        },
      ]);
      github.issues.updateComment.mockResolvedValue({
        data: { id: 555, html_url: "https://github.com/ha/c/pull/1#issuecomment-555" },
      });

      const rule: Rule = {
        name: "rule",
        description: "",
        statusSections: [
          { id: "merge-conflict", title: "Merge conflicts" },
          { id: "other", title: "Other" },
        ],
        events: {
          [EventType.PULL_REQUEST_SYNCHRONIZE]: async () => [
            ...(reEmit
              ? [
                  {
                    type: "statusSection" as const,
                    section: {
                      id: "merge-conflict",
                      title: "Merge conflicts",
                      status: reEmit.status,
                      message: reEmit.message,
                    },
                  },
                ]
              : []),
            {
              type: "statusSection" as const,
              section: { id: "other", title: "Other", status: "pass", message: "ok" },
            },
          ],
        },
      };
      const config: RegistryConfig = {
        repositories: { "home-assistant/core": [rule] },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
        github,
      });
      return { github, context };
    }

    it("keeps the waiver when the owning rule re-emits its failing section", async () => {
      const { github, context } = setupWaivedHarness({
        status: "fail",
        message: "Still conflicting.",
      });

      await dispatch(context);

      const writtenBody = github.issues.updateComment.mock.calls[0][0].body as string;
      // Fresh message and the waive reason are both visible; aggregate passes.
      expect(writtenBody).toContain("Still conflicting.");
      expect(writtenBody).toContain("Ignored: Will rebase before merge");
      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "ha-bot",
          state: "success",
          description: "All checks passed (1 warning)",
        }),
      );
      // No draft: the waived failure doesn't count as failing.
      expect(github.graphql).not.toHaveBeenCalled();
    });

    it("keeps the waiver on sections preserved from the prior comment", async () => {
      const { github, context } = setupWaivedHarness(null);

      await dispatch(context);

      const writtenBody = github.issues.updateComment.mock.calls[0][0].body as string;
      expect(writtenBody).toContain("Ignored: Will rebase before merge");
      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ context: "ha-bot", state: "success" }),
      );
    });

    it("carries the waiver along when the section turns passing", async () => {
      const { github, context } = setupWaivedHarness({
        status: "pass",
        message: "No conflicts.",
      });

      await dispatch(context);

      const writtenBody = github.issues.updateComment.mock.calls[0][0].body as string;
      // A passing section presents as passing — no waive note in the table
      // (the raw waiver only survives in the serialized section state).
      expect(writtenBody).toContain("No conflicts.");
      expect(writtenBody).not.toContain("Ignored: ");
      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ context: "ha-bot", state: "success" }),
      );
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
        statusSections: [{ id: "still-live", title: "still-live" }],
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => [
            {
              type: "statusSection",
              section: { id: "still-live", title: "Live", status: "pass", message: "ok" },
            },
          ],
        },
      };
      const config: RegistryConfig = {
        repositories: { "home-assistant/core": [rule] },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
      });

      await dispatch(context);

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
    // Must match the mock context's `botLogin` (derived from testEnv's BOT_SLUG).
    const BOT_LOGIN = "ha-bot[bot]";

    function setupStaleStatusHarness(existingStatuses: { context: string; state: string }[]) {
      const github = createMockGitHub();
      github.paginate.mockImplementation(async () => []);
      github.issues.createComment.mockResolvedValue({
        data: { id: 111, html_url: "https://github.com/ha/c/pull/1#issuecomment-111" },
      });
      const allStatuses = existingStatuses.map((s, idx) => ({
        ...s,
        id: idx,
        creator: { login: BOT_LOGIN },
      }));
      github.repos.listCommitStatusesForRef.mockResolvedValue({ data: allStatuses });
      const rule: Rule = {
        name: "with-dashboard",
        description: "",
        statusSections: [{ id: "live", title: "live" }],
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => [
            {
              type: "statusSection",
              section: { id: "live", title: "Live", status: "pass", message: "ok" },
            },
          ],
        },
      };
      const config: RegistryConfig = {
        repositories: { "home-assistant/core": [rule] },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
      });
      return { github, context };
    }

    it("neutralizes stale non-ha-bot statuses we wrote", async () => {
      const { github, context } = setupStaleStatusHarness([
        { context: "required-labels", state: "failure" },
        { context: "code-owner-approval", state: "failure" },
      ]);

      await dispatch(context);

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
      // A status from another bot — the sweep must leave it alone.
      github.repos.listCommitStatusesForRef.mockResolvedValue({
        data: [
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
        statusSections: [{ id: "live", title: "live" }],
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => [
            {
              type: "statusSection",
              section: { id: "live", title: "Live", status: "pass", message: "ok" },
            },
          ],
        },
      };
      const config: RegistryConfig = {
        repositories: { "home-assistant/core": [rule] },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
      });

      await dispatch(context);

      const neutralizing = github.repos.createCommitStatus.mock.calls.filter(
        (call) => call[0].description === "No longer in use",
      );
      expect(neutralizing).toHaveLength(0);
    });

    it("runs on first dispatch even with no prior ha-bot status", async () => {
      const github = createMockGitHub();
      github.paginate.mockImplementation(async () => []);
      github.issues.createComment.mockResolvedValue({
        data: { id: 111, html_url: "https://github.com/ha/c/pull/1#issuecomment-111" },
      });
      // No ha-bot status in history yet — sweep uses `context.botLogin` directly
      // so it can still neutralize any stale status the bot wrote previously.
      github.repos.listCommitStatusesForRef.mockResolvedValue({
        data: [
          {
            id: 1,
            context: "required-labels",
            state: "failure",
            creator: { login: BOT_LOGIN },
          },
        ],
      });
      const rule: Rule = {
        name: "rule",
        description: "",
        statusSections: [{ id: "live", title: "live" }],
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => [
            {
              type: "statusSection",
              section: { id: "live", title: "Live", status: "pass", message: "ok" },
            },
          ],
        },
      };
      const config: RegistryConfig = {
        repositories: { "home-assistant/core": [rule] },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
      });

      await dispatch(context);

      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "required-labels",
          state: "success",
          description: "No longer in use",
        }),
      );
    });

    it("skips statuses already in success state", async () => {
      const { github, context } = setupStaleStatusHarness([
        { context: "required-labels", state: "success" },
      ]);
      await dispatch(context);

      const neutralizing = github.repos.createCommitStatus.mock.calls.filter(
        (call) => call[0].description === "No longer in use",
      );
      expect(neutralizing).toHaveLength(0);
    });
  });
});

describe("label loop", () => {
  it("re-dispatches labeled rules until labels stabilize and applies the net diff", async () => {
    const github = createMockGitHub();
    const seenByB: string[][] = [];

    const ruleA: Rule = {
      name: "a",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [{ type: "addLabels", labels: ["X"] }],
      },
    };
    const ruleB: Rule = {
      name: "b",
      description: "",
      events: {
        [EventType.PULL_REQUEST_LABELED]: async (ctx) => {
          seenByB.push(await ctx.target.labels());
          if (ctx.event.label === "X") return [{ type: "addLabels", labels: ["Y"] }];
          return undefined;
        },
      },
    };
    const ruleC: Rule = {
      name: "c",
      description: "",
      events: {
        [EventType.PULL_REQUEST_LABELED]: async (ctx) =>
          ctx.event.label === "Y" ? [{ type: "removeLabels", labels: ["X"] }] : undefined,
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [ruleA, ruleB, ruleC] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    // X was added in round 1 and removed again in round 3, so only Y is applied.
    expect(github.issues.addLabels).toHaveBeenCalledTimes(1);
    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["Y"] }),
    );
    expect(github.issues.removeLabel).not.toHaveBeenCalled();
    // Synthetic contexts carry the simulated label state of their round.
    expect(seenByB).toEqual([["X"], ["X", "Y"]]);
  });

  it("dispatches synthetic unlabeled events for removed labels", async () => {
    const github = createMockGitHub();

    const remover: Rule = {
      name: "remover",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [{ type: "removeLabels", labels: ["stale"] }],
      },
    };
    const reactor: Rule = {
      name: "reactor",
      description: "",
      events: {
        [EventType.PULL_REQUEST_UNLABELED]: async (ctx) =>
          ctx.event.label === "stale" ? [{ type: "comment", body: "bye" }] : undefined,
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [remover, reactor] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      payload: { pull_request: { labels: [{ name: "stale" }] } },
    });

    await dispatch(context);

    expect(github.issues.removeLabel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "stale" }),
    );
    expect(github.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: "bye" }),
    );
  });

  it("does not call GitHub for labels already present", async () => {
    const github = createMockGitHub();
    const rule: Rule = {
      name: "labeler",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [
          { type: "addLabels", labels: ["cla-signed"] },
        ],
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [rule] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      payload: { pull_request: { labels: [{ name: "cla-signed" }] } },
    });

    await dispatch(context);

    expect(github.issues.addLabels).not.toHaveBeenCalled();
  });

  it("runs the loop for issue events via issues.labeled", async () => {
    const github = createMockGitHub();
    const labeler: Rule = {
      name: "labeler",
      description: "",
      events: {
        [EventType.ISSUES_OPENED]: async () => [{ type: "addLabels", labels: ["bug"] }],
      },
    };
    const reactor: Rule = {
      name: "reactor",
      description: "",
      events: {
        [EventType.ISSUES_LABELED]: async (ctx) =>
          ctx.event.label === "bug" ? [{ type: "comment", body: "triaged" }] : undefined,
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [labeler, reactor] },
    };
    const context = createMockIssueContext({
      registry: config,
      eventType: EventType.ISSUES_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["bug"] }),
    );
    expect(github.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: "triaged" }),
    );
  });

  it("cuts off non-converging rules and reports the exception", async () => {
    const github = createMockGitHub();
    const exceptionSpy = vi.spyOn(log, "exception").mockImplementation(() => {});

    const kickoff: Rule = {
      name: "kickoff",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => [{ type: "addLabels", labels: ["ping"] }],
      },
    };
    const flipper: Rule = {
      name: "flipper",
      description: "",
      events: {
        [EventType.PULL_REQUEST_LABELED]: async () => [{ type: "removeLabels", labels: ["ping"] }],
        [EventType.PULL_REQUEST_UNLABELED]: async () => [{ type: "addLabels", labels: ["ping"] }],
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [kickoff, flipper] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(exceptionSpy).toHaveBeenCalledTimes(1);
    expect(String(exceptionSpy.mock.calls[0][0])).toContain("did not stabilize");

    exceptionSpy.mockRestore();
  });
});
