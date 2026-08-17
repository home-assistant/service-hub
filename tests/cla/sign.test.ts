import { HttpException } from "@nestjs/common";
import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { ClaService } from "../../src/cla/cla.service.js";
import type { ClaStore } from "../../src/cla/store.js";
import { createMockGitHub, testEnv } from "../github/helpers/mock-context.js";

function claService(store: ClaStore | undefined, github = createMockGitHub()): ClaService {
  return new ClaService(testEnv, github as unknown as Octokit, store);
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

async function expectHttpError(promise: Promise<unknown>, status: number): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(status);
    return (err as HttpException).getResponse();
  }
  throw new Error(`expected an HttpException(${status})`);
}

describe("ClaService.sign", () => {
  it("503s when the store is not configured", async () => {
    const service = claService(undefined);

    await expectHttpError(service.sign({ github_username: "alice" }, "1.2.3.4", ""), 503);
  });

  it("400s without a github_username", async () => {
    const service = claService(fakeStore());

    await expectHttpError(service.sign({ name: "Alice" }, "1.2.3.4", ""), 400);
  });

  it("400s when no pending request exists for the user", async () => {
    const service = claService(fakeStore(undefined));

    const body = await expectHttpError(
      service.sign({ github_username: "alice" }, "1.2.3.4", ""),
      400,
    );

    expect((body as { message: string }).message).toContain("No pending request");
  });

  it("records the signature, clears the pending entry, and triggers a recheck", async () => {
    const store = fakeStore({ owner: "home-assistant", repo: "core", number: 42 });
    const github = createMockGitHub();
    const service = claService(store, github);

    const result = await service.sign(
      { github_username: "alice", email: "a@example.com" },
      "1.2.3.4",
      "",
    );

    expect(result).toEqual({ message: "ok" });
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
