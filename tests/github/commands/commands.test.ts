import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { close } from "../../../src/github/commands/close.js";
import { ignore, unignore } from "../../../src/github/commands/ignore.js";
import { addLabel } from "../../../src/github/commands/label-add.js";
import { removeLabel } from "../../../src/github/commands/label-remove.js";
import { markDraft } from "../../../src/github/commands/mark-draft.js";
import { rename } from "../../../src/github/commands/rename.js";
import { reopen } from "../../../src/github/commands/reopen.js";
import { update } from "../../../src/github/commands/update.js";
import { updateBranch } from "../../../src/github/commands/update-branch.js";
import { dispatchCommand } from "../../../src/github/engine/dispatch.js";
import { renderStatus } from "../../../src/github/engine/status/render.js";
import type { Rule } from "../../../src/github/engine/types.js";
import { expectReaction, makeCommandContext, registryWith } from "../helpers/command.js";
import { createMockGitHub, type MockGitHub } from "../helpers/mock-context.js";

// All commands except `update` are code_owner-gated; `testuser` passes as an
// org member (the mock's default). The manifest fetch mock feeds the rules
// that label effects trigger (quality scale, platinum approval).
const CODE_OWNER_ISSUE = { labels: [{ name: "integration: awesome" }] };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ domain: "awesome", name: "Awesome", codeowners: ["@testuser"] }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function asCodeOwner(body: string, github?: MockGitHub) {
  const command = {
    close,
    reopen,
    rename,
    "add-label": addLabel(["needs-more-information"]),
    "remove-label": removeLabel(["needs-more-information"]),
    "mark-draft": markDraft,
    "update-branch": updateBranch,
  }[body.split(/\s+/)[1]];
  if (!command) throw new Error(`no command for "${body}"`);
  return makeCommandContext(body, {
    github,
    registry: registryWith(command),
    issue: CODE_OWNER_ISSUE,
  });
}

describe("close / reopen", () => {
  it("closes the item", async () => {
    const { context, github } = asCodeOwner("/ha-bot close");
    await dispatchCommand(context);
    expect(github.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 1, state: "closed" }),
    );
    expectReaction(github, "+1");
  });

  it("reopens the item", async () => {
    const { context, github } = asCodeOwner("/ha-bot reopen");
    await dispatchCommand(context);
    expect(github.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 1, state: "open" }),
    );
    expectReaction(github, "+1");
  });
});

describe("rename", () => {
  it("sets a quoted multi-word title", async () => {
    const { context, github } = asCodeOwner('/ha-bot rename "Awesome new title"');
    await dispatchCommand(context);
    expect(github.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 1, title: "Awesome new title" }),
    );
    expectReaction(github, "+1");
  });

  it("rejects an unquoted title", async () => {
    const { context, github } = asCodeOwner("/ha-bot rename Awesome new title");
    await dispatchCommand(context);
    expect(github.issues.update).not.toHaveBeenCalled();
    expectReaction(github, "-1");
  });
});

describe("add-label / remove-label", () => {
  it("adds an allowlisted label", async () => {
    const { context, github } = asCodeOwner('/ha-bot add-label "needs-more-information"');
    await dispatchCommand(context);
    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["needs-more-information"] }),
    );
    expectReaction(github, "+1");
  });

  it("rejects labels outside the allowlist", async () => {
    const { context, github } = asCodeOwner('/ha-bot add-label "second-opinion-wanted"');
    await dispatchCommand(context);
    expect(github.issues.addLabels).not.toHaveBeenCalled();
    expectReaction(github, "-1");
  });

  it("removes a present allowlisted label", async () => {
    const command = removeLabel(["needs-more-information"]);
    const { context, github } = makeCommandContext(
      '/ha-bot remove-label "needs-more-information"',
      {
        registry: registryWith(command),
        issue: { labels: [{ name: "integration: awesome" }, { name: "needs-more-information" }] },
      },
    );
    await dispatchCommand(context);
    expect(github.issues.removeLabel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "needs-more-information" }),
    );
    expectReaction(github, "+1");
  });
});

describe("mark-draft", () => {
  it("converts a non-draft PR to draft via GraphQL", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({ data: { draft: false, node_id: "PR_NODE" } });
    const { context } = asCodeOwner("/ha-bot mark-draft", github);

    await dispatchCommand(context);
    expect(github.graphql).toHaveBeenCalledWith(
      expect.stringContaining("convertPullRequestToDraft"),
      { id: "PR_NODE" },
    );
    expectReaction(github, "+1");
  });

  it("does not touch a PR already in draft", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({ data: { draft: true, node_id: "PR_NODE" } });
    const { context } = asCodeOwner("/ha-bot mark-draft", github);

    await dispatchCommand(context);
    expect(github.graphql).not.toHaveBeenCalled();
    expectReaction(github, "+1");
  });
});

describe("update-branch", () => {
  it("updates the branch", async () => {
    const { context, github } = asCodeOwner("/ha-bot update-branch");
    await dispatchCommand(context);
    expect(github.pulls.updateBranch).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 1 }),
    );
    expectReaction(github, "+1");
  });

  it("surfaces update failures as a comment", async () => {
    const github = createMockGitHub();
    github.pulls.updateBranch.mockRejectedValue({
      response: { data: { message: "merge conflict between base and head" } },
    });
    const { context } = asCodeOwner("/ha-bot update-branch", github);

    await dispatchCommand(context);
    expect(github.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Failed to update branch: merge conflict between base and head",
      }),
    );
  });
});

describe("ignore / unignore", () => {
  // The PR author (the mock's default sender is also the target author)
  // waives and restores a check by its user-facing title.
  const claimingRule: Rule = {
    name: "merge-conflict",
    description: "",
    statusSections: [{ id: "merge-conflict", title: "Merge conflicts" }],
    events: {},
  };

  function withStatusComment(section: Record<string, unknown>) {
    const github = createMockGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [
        {
          id: 7,
          body: renderStatus(
            [
              {
                id: "merge-conflict",
                title: "Merge conflicts",
                status: "fail",
                message: "Branch has merge conflicts.",
                ...section,
              },
            ],
            "home-assistant/core",
          ),
        },
      ],
    });
    github.issues.updateComment.mockResolvedValue({
      data: { id: 7, html_url: "https://github.com/ha/c/pull/1#issuecomment-7" },
    });
    return github;
  }

  it("ignore waives the named check in the status comment", async () => {
    const github = withStatusComment({});
    const { context } = makeCommandContext(
      '/ha-bot ignore "Merge conflicts" "Will rebase before merge"',
      { github, registry: registryWith(ignore, [claimingRule]) },
    );

    await dispatchCommand(context);

    const body = github.issues.updateComment.mock.lastCall?.[0].body as string;
    expect(body).toContain("Ignored: Will rebase before merge");
    expectReaction(github, "+1");
  });

  it("unignore restores a waived check", async () => {
    const github = withStatusComment({ ignored: { reason: "Will rebase before merge" } });
    const { context } = makeCommandContext('/ha-bot unignore "Merge conflicts"', {
      github,
      registry: registryWith(unignore, [claimingRule]),
    });

    await dispatchCommand(context);

    const body = github.issues.updateComment.mock.lastCall?.[0].body as string;
    expect(body).not.toContain("Ignored: ");
    expect(body).toContain("Things to address:");
    expectReaction(github, "+1");
  });

  it("rejects an unknown check name", async () => {
    const github = withStatusComment({});
    const { context } = makeCommandContext('/ha-bot ignore "No such check" "reason"', {
      github,
      registry: registryWith(ignore, [claimingRule]),
    });

    await dispatchCommand(context);

    expect(github.issues.updateComment).not.toHaveBeenCalled();
    expectReaction(github, "-1");
  });
});

describe("update", () => {
  it("re-evaluates the item through the registry", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({
      data: {
        number: 1,
        node_id: "PR_1",
        labels: [],
        body: "",
        user: { login: "testuser", type: "User" },
        state: "open",
        draft: false,
        merged: false,
        merged_at: null,
        assignees: [],
        head: { sha: "abc123" },
        base: {
          ref: "dev",
          repo: {
            name: "core",
            full_name: "home-assistant/core",
            owner: { login: "home-assistant" },
            topics: [],
          },
        },
      },
    });
    const { context } = makeCommandContext("/ha-bot update", {
      github,
      registry: registryWith(update),
    });

    await dispatchCommand(context);
    expect(github.pulls.get).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 1 }));
    expectReaction(github, "+1");
  });
});
