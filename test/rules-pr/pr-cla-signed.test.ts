import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { claSigned } from "../../src/rules-pr/pr-cla-signed.js";
import {
  createMockContext,
  createMockDb,
  createMockGitHub,
  runRule,
} from "../helpers/mock-context.js";

const rule = claSigned;

describe("pr-cla-signed", () => {
  it("returns effects for opened events", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    const result = await runRule(rule, context);
    // No commits in mock → all-commits-ignored path: emits success-only effects
    expect(result?.effects).toBeDefined();
  });

  it("does nothing for non-cla-recheck labeled events", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        action: "labeled",
        label: { name: "bugfix" },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
  });

  it("removes recheck label and runs CLA check on cla-recheck", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        action: "labeled",
        label: { name: "cla-recheck" },
      },
    });

    const result = await runRule(rule, context);
    expect(result?.removeLabels).toContain("cla-recheck");
  });

  describe("CLA check effects", () => {
    it("adds cla-signed label when all authors signed", async () => {
      const github = createMockGitHub();
      const db = createMockDb();
      github.paginate.mockResolvedValue([
        {
          sha: "commit1",
          author: { login: "contributor", type: "User" },
          commit: { author: { email: "user@example.com" } },
        },
      ]);
      db.queryOne.mockResolvedValue({ github_username: "contributor" });

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        db,
      });

      const result = await runRule(rule, context);
      expect(result?.labels).toContain("cla-signed");
      expect(result?.removeLabels).toContain("cla-needed");
      expect(result?.statusChecks.every((s) => s.state === "success")).toBe(true);
    });

    it("requests changes when author has not signed CLA", async () => {
      const github = createMockGitHub();
      const db = createMockDb();
      github.paginate.mockResolvedValue([
        {
          sha: "commit1",
          author: { login: "newcontributor", type: "User" },
          commit: { author: { email: "new@example.com" } },
        },
      ]);
      db.queryOne.mockResolvedValue(null);

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        db,
      });

      const result = await runRule(rule, context);
      expect(result?.requestChanges).toBeDefined();
      expect(result?.labels).toContain("cla-needed");
      expect(result?.statusChecks[0]?.state).toBe("failure");
    });

    it("requests changes for commits without linked GitHub user", async () => {
      const github = createMockGitHub();
      const db = createMockDb();
      github.paginate.mockResolvedValue([
        {
          sha: "commit1",
          author: null,
          commit: { author: { email: "unknown@example.com" } },
        },
      ]);

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        db,
      });

      const result = await runRule(rule, context);
      expect(result?.requestChanges).toBeDefined();
      expect(result?.labels).toContain("cla-error");
    });

    it("skips bot commits", async () => {
      const github = createMockGitHub();
      const db = createMockDb();
      github.paginate.mockResolvedValue([
        {
          sha: "commit1",
          author: { login: "github-actions[bot]", type: "Bot" },
          commit: { author: { email: "bot@users.noreply.github.com" } },
        },
      ]);

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        db,
      });

      const result = await runRule(rule, context);
      // All commits ignored — success status, no cla-signed label
      expect(result?.statusChecks[0]?.state).toBe("success");
      expect(result?.labels).toBeUndefined();
    });

    it("records pending signers via dbExecute effect", async () => {
      const github = createMockGitHub();
      const db = createMockDb();
      github.paginate.mockResolvedValue([
        {
          sha: "commit1",
          author: { login: "unsigned", type: "User" },
          commit: { author: { email: "unsigned@example.com" } },
        },
      ]);
      db.queryOne.mockResolvedValue(null);

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        db,
      });

      const result = await runRule(rule, context);
      const dbEffect = result?.effects.find((e) => e.type === "dbExecute");
      expect(dbEffect).toBeDefined();
      if (dbEffect && dbEffect.type === "dbExecute") {
        expect(dbEffect.sql).toContain("INSERT OR REPLACE INTO cla_pending_signers");
        expect(dbEffect.params[0]).toBe("unsigned");
      }
    });
  });

  it("listens to opened, reopened, synchronize, and labeled events", () => {
    const events = Object.keys(rule.events);
    expect(events).toContain(EventType.PULL_REQUEST_OPENED);
    expect(events).toContain(EventType.PULL_REQUEST_REOPENED);
    expect(events).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
    expect(events).toContain(EventType.PULL_REQUEST_LABELED);
  });
});
