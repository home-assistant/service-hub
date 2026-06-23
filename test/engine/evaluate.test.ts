import { describe, expect, it, vi } from "vitest";
import type { RegistryConfig } from "../../src/engine/dispatch.js";
import { evaluatePR, evaluateRecentPRs } from "../../src/engine/evaluate.js";
import { createMockGitHub } from "../helpers/mock-context.js";

vi.mock("../../src/engine/dispatch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/engine/dispatch.js")>();
  return {
    ...actual,
    dispatch: vi.fn().mockResolvedValue(undefined),
  };
});

const { dispatch } = await import("../../src/engine/dispatch.js");

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
      pull_number: 42,
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
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("#1"), expect.any(Error));
    // PR #2 should still have been evaluated
    expect(github.pulls.get).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
  });
});
