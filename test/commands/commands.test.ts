import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { close } from "../../src/commands/close.js";
import { addLabel } from "../../src/commands/label-add.js";
import { removeLabel } from "../../src/commands/label-remove.js";
import { markDraft } from "../../src/commands/mark-draft.js";
import { readyForReview } from "../../src/commands/ready-for-review.js";
import { rename } from "../../src/commands/rename.js";
import { reopen } from "../../src/commands/reopen.js";
import { update } from "../../src/commands/update.js";
import { updateBranch } from "../../src/commands/update-branch.js";
import { dispatchCommand } from "../../src/engine/dispatch.js";
import { expectReaction, makeCommandContext, registryWith } from "../helpers/command.js";
import { createMockGitHub, type MockGitHub } from "../helpers/mock-context.js";

// All commands except `update` are code_owner-gated: give the item a single
// `integration: awesome` label and serve a manifest owning `testuser`.
const CODE_OWNER_ISSUE = { labels: [{ name: "integration: awesome" }] };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = mock().mockResolvedValue({
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
    "ready-for-review": readyForReview,
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
  it("sets a multi-word title", async () => {
    const { context, github } = asCodeOwner("/ha-bot rename Awesome new title");
    await dispatchCommand(context);
    expect(github.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 1, title: "Awesome new title" }),
    );
    expectReaction(github, "+1");
  });
});

describe("add-label / remove-label", () => {
  it("adds an allowlisted label", async () => {
    const { context, github } = asCodeOwner("/ha-bot add-label needs-more-information");
    await dispatchCommand(context);
    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["needs-more-information"] }),
    );
    expectReaction(github, "+1");
  });

  it("rejects labels outside the allowlist", async () => {
    const { context, github } = asCodeOwner("/ha-bot add-label second-opinion-wanted");
    await dispatchCommand(context);
    expect(github.issues.addLabels).not.toHaveBeenCalled();
    expectReaction(github, "-1");
  });

  it("removes a present allowlisted label", async () => {
    const command = removeLabel(["needs-more-information"]);
    const { context, github } = makeCommandContext("/ha-bot remove-label needs-more-information", {
      registry: registryWith(command),
      issue: { labels: [{ name: "integration: awesome" }, { name: "needs-more-information" }] },
    });
    await dispatchCommand(context);
    expect(github.issues.removeLabel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "needs-more-information" }),
    );
    expectReaction(github, "+1");
  });
});

describe("mark-draft / ready-for-review", () => {
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

  it("marks a draft PR ready for review via GraphQL", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({ data: { draft: true, node_id: "PR_NODE" } });
    const { context } = asCodeOwner("/ha-bot ready-for-review", github);

    await dispatchCommand(context);
    expect(github.graphql).toHaveBeenCalledWith(
      expect.stringContaining("markPullRequestReadyForReview"),
      { id: "PR_NODE" },
    );
    expectReaction(github, "+1");
  });

  it("does not touch a PR already in the requested state", async () => {
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
