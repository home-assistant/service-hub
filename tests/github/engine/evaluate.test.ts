import { describe, expect, it, vi } from "vitest";
import { evaluateIssue, evaluatePR } from "../../../src/github/engine/evaluate.js";
import type { RegistryConfig } from "../../../src/github/engine/types.js";
import { createMockGitHub, testEnv } from "../helpers/mock-context.js";

// vi.mock is hoisted above the imports and scoped to this file — other test
// files keep the real dispatch.
const dispatch = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../../src/github/engine/dispatch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/github/engine/dispatch.js")>()),
  dispatch,
}));

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

    await evaluatePR(testEnv, config, github as never, {
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

    await evaluateIssue(testEnv, config, github as never, {
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

    await evaluateIssue(testEnv, config, github as never, {
      owner: "home-assistant",
      repo: "core",
      number: 42,
    });

    expect(github.pulls.get).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 42 }));
    expect(dispatch).toHaveBeenCalled();
  });
});
