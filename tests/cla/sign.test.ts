import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { claSignatureHandler } from "../../src/cla/sign.js";
import type { ClaStore } from "../../src/cla/store.js";
import { createMockGitHub, testEnv } from "../github/helpers/mock-context.js";

function signRequest(body: unknown): Request {
  return new Request("http://localhost/cla-sign", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
  });
}

function fakeStore(pending?: { owner: string; repo: string; number: number }): ClaStore {
  return {
    hasSigned: async () => false,
    recordPendingSigners: async () => {},
    getPendingSigner: async () => pending,
    deletePendingSigner: vi.fn(async () => {}),
    recordSignature: vi.fn(async () => {}),
  };
}

describe("claSignatureHandler", () => {
  it("503s when the store is not configured", async () => {
    const response = await claSignatureHandler(
      testEnv,
      createMockGitHub() as unknown as Octokit,
      signRequest({ github_username: "alice" }),
      undefined,
    );
    expect(response.status).toBe(503);
  });

  it("400s without a github_username", async () => {
    const response = await claSignatureHandler(
      testEnv,
      createMockGitHub() as unknown as Octokit,
      signRequest({ name: "Alice" }),
      fakeStore(),
    );
    expect(response.status).toBe(400);
  });

  it("400s when no pending request exists for the user", async () => {
    const response = await claSignatureHandler(
      testEnv,
      createMockGitHub() as unknown as Octokit,
      signRequest({ github_username: "alice" }),
      fakeStore(undefined),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain("No pending request");
  });

  it("records the signature, clears the pending entry, and triggers a recheck", async () => {
    const store = fakeStore({ owner: "home-assistant", repo: "core", number: 42 });
    const github = createMockGitHub();
    const response = await claSignatureHandler(
      testEnv,
      github as unknown as Octokit,
      signRequest({ github_username: "alice", email: "a@example.com" }),
      store,
    );
    expect(response.status).toBe(200);
    expect(store.recordSignature).toHaveBeenCalledWith(
      expect.objectContaining({ github_username: "alice", ip_address: "1.2.3.4" }),
    );
    expect(store.deletePendingSigner).toHaveBeenCalledWith("alice");
    expect(github.issues.addLabels).toHaveBeenCalledWith({
      owner: "home-assistant",
      repo: "core",
      issue_number: 42,
      labels: ["cla-recheck"],
    });
  });
});
