import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prClaSigned } from "../../src/rules-pr/pr-cla-signed.js";
import { createMockContext, createMockDb, createMockGitHub } from "../helpers/mock-context.js";

describe("pr-cla-signed", () => {
  it("skips ignored repositories", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        repository: {
          full_name: "home-assistant/brands",
          name: "brands",
          owner: { login: "home-assistant" },
        },
      },
    });

    const result = await prClaSigned.handle(context);
    expect(result).toBeUndefined();
  });

  it("returns action for opened events", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
    });

    const result = await prClaSigned.handle(context);
    expect(result?.actions).toHaveLength(1);
  });

  it("only processes labeled events for cla-recheck label", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        action: "labeled",
        label: { name: "bugfix" },
      },
    });

    const result = await prClaSigned.handle(context);
    expect(result).toBeUndefined();
  });

  it("removes recheck label and returns action for cla-recheck", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        action: "labeled",
        label: { name: "cla-recheck" },
      },
    });

    const result = await prClaSigned.handle(context);
    expect(result?.removeLabels).toContain("cla-recheck");
    expect(result?.actions).toHaveLength(1);
  });

  describe("CLA check action", () => {
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

      const result = await prClaSigned.handle(context);
      expect(result?.actions?.[0]).toBeDefined();
      if (result?.actions?.[0]) await result.actions[0](context);

      expect(github.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ["cla-signed"] }),
      );
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

      const result = await prClaSigned.handle(context);
      expect(result?.actions?.[0]).toBeDefined();
      if (result?.actions?.[0]) await result.actions[0](context);

      expect(github.pulls.createReview).toHaveBeenCalledWith(
        expect.objectContaining({ event: "REQUEST_CHANGES" }),
      );
      expect(github.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ["cla-needed"] }),
      );
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

      const result = await prClaSigned.handle(context);
      expect(result?.actions?.[0]).toBeDefined();
      if (result?.actions?.[0]) await result.actions[0](context);

      expect(github.pulls.createReview).toHaveBeenCalledWith(
        expect.objectContaining({ event: "REQUEST_CHANGES" }),
      );
      expect(github.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ["cla-error"] }),
      );
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

      const result = await prClaSigned.handle(context);
      expect(result?.actions?.[0]).toBeDefined();
      if (result?.actions?.[0]) await result.actions[0](context);

      // All commits ignored — no CLA labels, but still sets success status
      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ state: "success" }),
      );
    });

    it("records pending signers in database", async () => {
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

      const result = await prClaSigned.handle(context);
      expect(result?.actions?.[0]).toBeDefined();
      if (result?.actions?.[0]) await result.actions[0](context);

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO cla_pending_signers"),
        "unsigned",
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });
  });

  it("listens to opened, reopened, synchronize, and labeled events", () => {
    expect(prClaSigned.listens).toContain(EventType.PULL_REQUEST_OPENED);
    expect(prClaSigned.listens).toContain(EventType.PULL_REQUEST_REOPENED);
    expect(prClaSigned.listens).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
    expect(prClaSigned.listens).toContain(EventType.PULL_REQUEST_LABELED);
  });
});
