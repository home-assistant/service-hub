import { describe, expect, it } from "vitest";
import type { RegistryConfig } from "../../../src/github/engine/dispatch.js";
import { dispatch } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import { renderStatus } from "../../../src/github/engine/status/render.js";
import type { Effect, Rule } from "../../../src/github/engine/types.js";
import { createMockContext, createMockGitHub, type MockGitHub } from "../helpers/mock-context.js";

/**
 * One test per Effect variant: the mapping from the effect a rule emits to
 * the GitHub API call the dispatcher makes. Batching/dedupe semantics and the
 * label loop live in dispatch.test.ts; this file is only about which call
 * each effect turns into. Context defaults (mock-context.ts): PR #1 on
 * home-assistant/core, head sha abc123, node_id PR_1, not a draft.
 */

const REPO = { owner: "home-assistant", repo: "core" };

async function apply(
  effects: Effect[],
  opts: {
    github?: MockGitHub;
    payload?: Record<string, unknown>;
    statusSections?: Rule["statusSections"];
  } = {},
): Promise<MockGitHub> {
  const github = opts.github ?? createMockGitHub();
  const rule: Rule = {
    name: "emitter",
    description: "",
    statusSections: opts.statusSections,
    events: { [EventType.PULL_REQUEST_OPENED]: async () => effects },
  };
  const config: RegistryConfig = { repositories: { "home-assistant/core": [rule] } };
  await dispatch(config, createMockContext({ github, payload: opts.payload }));
  return github;
}

describe("effect → GitHub API mapping", () => {
  it("addLabels → issues.addLabels on the target", async () => {
    const github = await apply([{ type: "addLabels", labels: ["bugfix", "has-tests"] }]);

    expect(github.issues.addLabels).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      labels: ["bugfix", "has-tests"],
    });
  });

  it("addLabelsCrossRepo → issues.addLabels on the effect's own coordinates", async () => {
    const github = await apply([
      {
        type: "addLabelsCrossRepo",
        owner: "home-assistant",
        repo: "home-assistant.io",
        issue_number: 42,
        labels: ["has-parent"],
      },
    ]);

    expect(github.issues.addLabels).toHaveBeenCalledTimes(1);
    expect(github.issues.addLabels).toHaveBeenCalledWith({
      owner: "home-assistant",
      repo: "home-assistant.io",
      issue_number: 42,
      labels: ["has-parent"],
    });
  });

  it("removeLabels → one issues.removeLabel per label the target has", async () => {
    const github = await apply([{ type: "removeLabels", labels: ["stale", "needs-rebase"] }], {
      payload: { pull_request: { labels: [{ name: "stale" }, { name: "needs-rebase" }] } },
    });

    expect(github.issues.removeLabel).toHaveBeenCalledTimes(2);
    expect(github.issues.removeLabel).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      name: "stale",
    });
    expect(github.issues.removeLabel).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      name: "needs-rebase",
    });
  });

  it("addAssignees → issues.addAssignees", async () => {
    const github = await apply([{ type: "addAssignees", assignees: ["balloob", "frenck"] }]);

    expect(github.issues.addAssignees).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      assignees: ["balloob", "frenck"],
    });
  });

  it("removeAssignees → issues.removeAssignees", async () => {
    const github = await apply([{ type: "removeAssignees", assignees: ["balloob"] }]);

    expect(github.issues.removeAssignees).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      assignees: ["balloob"],
    });
  });

  it("comment → issues.createComment", async () => {
    const github = await apply([{ type: "comment", body: "Hello there!" }]);

    expect(github.issues.createComment).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      body: "Hello there!",
    });
  });

  it("setTitle → issues.update", async () => {
    const github = await apply([{ type: "setTitle", title: "Better title" }]);

    expect(github.issues.update).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      title: "Better title",
    });
  });

  it("setState → issues.update", async () => {
    const github = await apply([{ type: "setState", state: "closed" }]);

    expect(github.issues.update).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      state: "closed",
    });
  });

  it("updatePullRequest → pulls.update on the effect's own coordinates", async () => {
    const github = await apply([
      {
        type: "updatePullRequest",
        owner: "home-assistant",
        repo: "home-assistant.io",
        pull_number: 9,
        state: "closed",
      },
    ]);

    expect(github.pulls.update).toHaveBeenCalledWith({
      owner: "home-assistant",
      repo: "home-assistant.io",
      pull_number: 9,
      state: "closed",
    });
  });

  it("requestReviewers → pulls.requestReviewers", async () => {
    const github = await apply([{ type: "requestReviewers", reviewers: ["frenck"] }]);

    expect(github.pulls.requestReviewers).toHaveBeenCalledWith({
      ...REPO,
      pull_number: 1,
      reviewers: ["frenck"],
    });
  });

  it("updateBranch → pulls.updateBranch", async () => {
    const github = await apply([{ type: "updateBranch" }]);

    expect(github.pulls.updateBranch).toHaveBeenCalledWith({ ...REPO, pull_number: 1 });
  });

  it("convertToDraft → convertPullRequestToDraft mutation with the PR's node id", async () => {
    const github = await apply([{ type: "convertToDraft" }]);

    expect(github.graphql).toHaveBeenCalledWith(
      expect.stringContaining("convertPullRequestToDraft"),
      {
        id: "PR_1",
      },
    );
  });

  it("convertToDraft is a no-op when the PR is already a draft", async () => {
    const github = await apply([{ type: "convertToDraft" }], {
      payload: { pull_request: { draft: true } },
    });

    expect(github.graphql).not.toHaveBeenCalled();
  });

  it("markReadyForReview → markPullRequestReadyForReview mutation with the PR's node id", async () => {
    const github = await apply([{ type: "markReadyForReview" }], {
      payload: { pull_request: { draft: true } },
    });

    expect(github.graphql).toHaveBeenCalledWith(
      expect.stringContaining("markPullRequestReadyForReview"),
      { id: "PR_1" },
    );
  });

  it("markReadyForReview is a no-op when the PR is not a draft", async () => {
    const github = await apply([{ type: "markReadyForReview" }]);

    expect(github.graphql).not.toHaveBeenCalled();
  });

  it("statusSection → status comment plus ha-bot commit status on the head sha", async () => {
    const github = createMockGitHub();
    github.issues.createComment.mockResolvedValue({
      data: { id: 999, html_url: "https://github.com/ha/c/pull/1#issuecomment-999" },
    });
    await apply(
      [
        {
          type: "statusSection",
          section: { id: "a", title: "Alpha check", status: "pass", message: "ok" },
        },
      ],
      { github },
    );

    const statusBody = github.issues.createComment.mock.lastCall?.[0].body as string;
    expect(statusBody).toContain("Alpha check");
    expect(github.repos.createCommitStatus).toHaveBeenCalledWith({
      ...REPO,
      sha: "abc123",
      context: "ha-bot",
      state: "success",
      description: "All checks passed",
      target_url: "https://github.com/ha/c/pull/1#issuecomment-999",
    });
  });

  it("removeStatusSection → issues.updateComment without the removed section", async () => {
    const github = createMockGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [
        {
          id: 7,
          body: renderStatus(
            [
              { id: "a", title: "Alpha check", status: "pass", message: "ok" },
              { id: "b", title: "Beta check", status: "pass", message: "ok" },
            ],
            "home-assistant/core",
          ),
        },
      ],
    });
    await apply([{ type: "removeStatusSection", id: "a" }], {
      github,
      statusSections: [
        { id: "a", title: "Alpha check" },
        { id: "b", title: "Beta check" },
      ],
    });

    expect(github.issues.updateComment).toHaveBeenCalledTimes(1);
    const body = github.issues.updateComment.mock.lastCall?.[0].body as string;
    expect(body).toContain("Beta check");
    expect(body).not.toContain("Alpha check");
  });

  it("removeStatusSection alone never creates a status comment", async () => {
    const github = await apply([{ type: "removeStatusSection", id: "a" }], {
      statusSections: [{ id: "a", title: "Alpha check" }],
    });

    expect(github.issues.createComment).not.toHaveBeenCalled();
    expect(github.issues.updateComment).not.toHaveBeenCalled();
    expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
  });

  it("overrideSection → issues.updateComment waiving the section, status flips to success", async () => {
    const github = createMockGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [
        {
          id: 7,
          body: renderStatus(
            [{ id: "a", title: "Alpha check", status: "fail", message: "broken" }],
            "home-assistant/core",
          ),
        },
      ],
    });
    github.issues.updateComment.mockResolvedValue({
      data: { id: 7, html_url: "https://github.com/ha/c/pull/1#issuecomment-7" },
    });
    await apply([{ type: "overrideSection", id: "a", ignore: { reason: "by-design" } }], {
      github,
      statusSections: [{ id: "a", title: "Alpha check" }],
    });

    const body = github.issues.updateComment.mock.lastCall?.[0].body as string;
    expect(body).toContain("Ignored: by-design");
    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "ha-bot",
        state: "success",
        description: "All checks passed (1 warning)",
      }),
    );
  });

  it("overrideSection alone never creates a status comment", async () => {
    const github = await apply([{ type: "overrideSection", id: "a", ignore: { reason: "r" } }], {
      statusSections: [{ id: "a", title: "Alpha check" }],
    });

    expect(github.issues.createComment).not.toHaveBeenCalled();
    expect(github.issues.updateComment).not.toHaveBeenCalled();
    expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
  });
});

describe("aggregate ha-bot status check from status sections", () => {
  function setupHarness(sections: { id: string; status: "pass" | "fail" | "pending" | "skip" }[]) {
    const github = createMockGitHub();
    github.issues.createComment.mockResolvedValue({
      data: { id: 999, html_url: "https://github.com/ha/c/pull/1#issuecomment-999" },
    });
    const effects = sections.map((s) => ({
      type: "statusSection" as const,
      section: { id: s.id, title: s.id, status: s.status, message: s.id },
    }));
    return { github, run: () => apply(effects, { github }) };
  }

  it("writes a success ha-bot status when all sections pass", async () => {
    const { github, run } = setupHarness([{ id: "a", status: "pass" }]);
    await run();

    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "ha-bot",
        state: "success",
        target_url: expect.stringContaining("#issuecomment-999"),
      }),
    );
  });

  it("writes a failure ha-bot status when any section fails", async () => {
    const { github, run } = setupHarness([
      { id: "a", status: "pass" },
      { id: "b", status: "fail" },
    ]);
    await run();

    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "ha-bot",
        state: "failure",
        description: expect.stringContaining("1 check failing"),
      }),
    );
  });

  it("counts skipped sections as success and notes them in the description", async () => {
    const { github, run } = setupHarness([
      { id: "a", status: "pass" },
      { id: "b", status: "skip" },
      { id: "c", status: "skip" },
    ]);
    await run();

    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "ha-bot",
        state: "success",
        description: expect.stringContaining("2 skipped"),
      }),
    );
  });

  it("writes a failing ha-bot status when a section is pending", async () => {
    const { github, run } = setupHarness([
      { id: "a", status: "pass" },
      { id: "b", status: "pending" },
    ]);
    await run();

    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "ha-bot",
        state: "failure",
        description: expect.stringContaining("1 check pending"),
      }),
    );
  });

  it("does not write a ha-bot status if no rule emitted a status section", async () => {
    const github = await apply([{ type: "addLabels", labels: ["x"] }]);

    expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
  });
});
