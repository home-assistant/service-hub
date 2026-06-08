import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prLabelMergeTarget } from "../../src/rules-pr/pr-label-merge-target.js";
import {
  createMockContext,
  createMockGitHub,
  type MockGitHub,
  runRule,
} from "../helpers/mock-context.js";

function nonMemberGitHub(): MockGitHub {
  const github = createMockGitHub();
  // GitHub returns 404 for non-members. Mimic that with a thrown error.
  github.orgs.getMembershipForUser.mockRejectedValue(
    Object.assign(new Error("Not Found"), { status: 404 }),
  );
  return github;
}

function memberGitHub(): MockGitHub {
  const github = createMockGitHub();
  github.orgs.getMembershipForUser.mockResolvedValue({
    data: { state: "active", role: "member" },
  });
  return github;
}

describe("pr-label-merge-target", () => {
  describe("master target", () => {
    it("labels merging-to-master and emits a dashboard fail row for non-members", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        github: nonMemberGitHub(),
        payload: {
          pull_request: {
            body: "",
            base: { ref: "master" },
            head: { sha: "abc123" },
            user: { login: "drive-by-contributor" },
          },
        },
      });

      const result = await runRule(prLabelMergeTarget, context);
      expect(result?.labels).toContain("merging-to-master");
      expect(result?.dashboard?.id).toBe("merge-target");
      expect(result?.dashboard?.status).toBe("fail");
      expect(result?.dashboard?.message).toContain("master");
    });

    it("downgrades the dashboard row to info for org members", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        github: memberGitHub(),
        payload: {
          pull_request: {
            body: "",
            base: { ref: "master" },
            head: { sha: "abc123" },
            user: { login: "balloob" },
          },
        },
      });

      const result = await runRule(prLabelMergeTarget, context);
      expect(result?.labels).toContain("merging-to-master");
      expect(result?.dashboard?.id).toBe("merge-target");
      expect(result?.dashboard?.status).toBe("info");
      expect(result?.dashboard?.message).toContain("master");
    });
  });

  describe("rc target", () => {
    it("labels merging-to-rc and emits a dashboard fail row for non-members", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        github: nonMemberGitHub(),
        payload: {
          pull_request: {
            body: "",
            base: { ref: "rc" },
            head: { sha: "abc123" },
            user: { login: "drive-by-contributor" },
          },
        },
      });

      const result = await runRule(prLabelMergeTarget, context);
      expect(result?.labels).toContain("merging-to-rc");
      expect(result?.dashboard?.status).toBe("fail");
      expect(result?.dashboard?.message).toContain("rc");
    });

    it("downgrades the dashboard row to info for org members", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        github: memberGitHub(),
        payload: {
          pull_request: {
            body: "",
            base: { ref: "rc" },
            head: { sha: "abc123" },
            user: { login: "balloob" },
          },
        },
      });

      const result = await runRule(prLabelMergeTarget, context);
      expect(result?.labels).toContain("merging-to-rc");
      expect(result?.dashboard?.status).toBe("info");
      expect(result?.dashboard?.message).toContain("rc");
    });
  });

  it("adds nothing for the default branch", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: { body: "", base: { ref: "dev" }, head: { sha: "abc123" } },
      },
    });

    const result = await runRule(prLabelMergeTarget, context);
    expect(result).toBeUndefined();
  });

  it("skips for bot senders", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        sender: { login: "dependabot[bot]", type: "Bot" },
        pull_request: { body: "", base: { ref: "master" }, head: { sha: "abc123" } },
      },
    });

    const result = await runRule(prLabelMergeTarget, context);
    expect(result).toBeUndefined();
  });
});
