import { afterAll, describe, expect, it, mock, spyOn } from "bun:test";
import type { RegistryConfig } from "../../../src/github/engine/dispatch.js";
import { log } from "../../../src/log.js";
import { createMockGitHub } from "../helpers/mock-context.js";

// bun's mock.module is neither hoisted nor scoped to this file: register the
// dispatch mock before importing evaluate, and restore the real module in
// afterAll — other test files exercise the original dispatch.
const actualDispatchModule = { ...(await import("../../../src/github/engine/dispatch.js")) };

const dispatch = mock(async () => undefined);
mock.module("../../../src/github/engine/dispatch.js", () => ({
  ...actualDispatchModule,
  dispatch,
}));

afterAll(() => {
  mock.module("../../../src/github/engine/dispatch.js", () => actualDispatchModule);
});

const { evaluateIssue, evaluatePR, evaluateRecentPRs } = await import(
  "../../../src/github/engine/evaluate.js"
);

const config: RegistryConfig = {
  repositories: { "home-assistant/core": [] },
};

describe("evaluatePR", () => {
  it("fetches PR and dispatches rules", async () => {
    const github = createMockGitHub();

    github.pulls.get.mockResolvedValue({
      data: {
        number: 42,
        head: { sha: "abc123" },
        base: { repo: { owner: { login: "home-assistant" }, name: "core" } },
        user: { login: "testuser", type: "User" },
      },
    });

    await evaluatePR(config, github as never, {
      owner: "home-assistant",
      repo: "core",
      number: 42,
    });

    expect(github.pulls.get).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 42 }));
    expect(dispatch).toHaveBeenCalled();
  });
});

describe("evaluateIssue", () => {
  it("fetches the issue and dispatches rules", async () => {
    const github = createMockGitHub();

    github.issues.get.mockResolvedValue({
      data: {
        number: 7,
        labels: [{ name: "bug" }],
        body: "it broke",
        user: { login: "reporter", type: "User" },
        state: "open",
      },
    });

    await evaluateIssue(config, github as never, {
      owner: "home-assistant",
      repo: "core",
      number: 7,
    });

    expect(github.issues.get).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 7 }));
    expect(github.pulls.get).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalled();
  });

  it("routes PR numbers through the PR path", async () => {
    const github = createMockGitHub();

    github.issues.get.mockResolvedValue({
      data: {
        number: 42,
        pull_request: { url: "https://api.github.com/repos/home-assistant/core/pulls/42" },
        user: { login: "author", type: "User" },
      },
    });
    github.pulls.get.mockResolvedValue({
      data: {
        number: 42,
        head: { sha: "abc123" },
        base: { repo: { owner: { login: "home-assistant" }, name: "core" } },
        user: { login: "author", type: "User" },
      },
    });

    await evaluateIssue(config, github as never, {
      owner: "home-assistant",
      repo: "core",
      number: 42,
    });

    expect(github.pulls.get).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 42 }));
    expect(dispatch).toHaveBeenCalled();
  });
});

describe("evaluateRecentPRs", () => {
  it("evaluates recently updated PRs", async () => {
    const github = createMockGitHub();
    const now = new Date();

    github.pulls.list.mockResolvedValue({
      data: [
        {
          number: 1,
          updated_at: now.toISOString(),
          head: { sha: "sha1" },
          base: { repo: { owner: { login: "home-assistant" }, name: "core" } },
          user: { login: "u1", type: "User" },
        },
        {
          number: 2,
          updated_at: new Date(now.getTime() - 20 * 60 * 1000).toISOString(), // 20 min ago
          head: { sha: "sha2" },
          base: { repo: { owner: { login: "home-assistant" }, name: "core" } },
          user: { login: "u2", type: "User" },
        },
      ],
    });

    github.pulls.get.mockImplementation(({ pull_number }: { pull_number: number }) =>
      Promise.resolve({
        data: {
          number: pull_number,
          head: { sha: `sha${pull_number}` },
          base: { repo: { owner: { login: "home-assistant" }, name: "core" } },
          user: { login: `u${pull_number}`, type: "User" },
        },
      }),
    );

    const since = new Date(now.getTime() - 10 * 60 * 1000); // 10 min ago
    await evaluateRecentPRs(config, github as never, "home-assistant/core", since);

    // Only PR #1 was updated within the last 10 minutes
    expect(github.pulls.get).toHaveBeenCalledTimes(1);
    expect(github.pulls.get).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 1 }));
  });

  it("continues when a single PR evaluation fails", async () => {
    const github = createMockGitHub();
    const now = new Date();
    const logErrorSpy = spyOn(log, "error").mockImplementation(() => {});

    github.pulls.list.mockResolvedValue({
      data: [
        {
          number: 1,
          updated_at: now.toISOString(),
        },
        {
          number: 2,
          updated_at: now.toISOString(),
        },
      ],
    });

    github.pulls.get.mockRejectedValueOnce(new Error("API error")).mockResolvedValueOnce({
      data: {
        number: 2,
        head: { sha: "sha2" },
        base: { repo: { owner: { login: "home-assistant" }, name: "core" } },
        user: { login: "u2", type: "User" },
      },
    });

    const since = new Date(now.getTime() - 10 * 60 * 1000);
    await evaluateRecentPRs(config, github as never, "home-assistant/core", since);

    expect(logErrorSpy).toHaveBeenCalledWith(
      "evaluateRecentPRs: PR evaluation failed",
      expect.objectContaining({ number: 1 }),
    );
    // PR #2 should still have been evaluated
    expect(github.pulls.get).toHaveBeenCalledTimes(2);

    logErrorSpy.mockRestore();
  });
});
