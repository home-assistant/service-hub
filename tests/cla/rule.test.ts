import { describe, expect, it, vi } from "vitest";
import { claCheck } from "../../src/cla/rule.js";
import type { ClaStore } from "../../src/cla/store.js";
import { EventType } from "../../src/github/engine/event.js";
import { createMockContext, createMockGitHub, runRule } from "../github/helpers/mock-context.js";

interface MockCommit {
  sha: string;
  author?: { login?: string; type?: string } | null;
  commit?: { author?: { email?: string } };
}

function fakeStore(signed: string[]): ClaStore {
  return {
    hasSigned: async (login) => signed.includes(login),
    recordPendingSigners: vi.fn(async () => {}),
    getPendingSigner: async () => undefined,
    deletePendingSigner: async () => {},
    recordSignature: async () => {},
  };
}

function claContext(opts: {
  commits: MockCommit[];
  eventType?: EventType;
  label?: string;
  repository?: string;
}) {
  const github = createMockGitHub();
  github.pulls.listCommits.mockResolvedValue({ data: opts.commits });
  const fullName = opts.repository ?? "home-assistant/core";
  return createMockContext({
    eventType: opts.eventType ?? EventType.PULL_REQUEST_OPENED,
    github,
    payload: {
      action: opts.eventType === EventType.PULL_REQUEST_LABELED ? "labeled" : "opened",
      ...(opts.label ? { label: { name: opts.label } } : {}),
      repository: {
        full_name: fullName,
        name: fullName.split("/")[1],
        owner: { login: fullName.split("/")[0] },
      },
    },
  });
}

const userCommit = (sha: string, login: string): MockCommit => ({
  sha,
  author: { login, type: "User" },
  commit: { author: { email: `${login}@example.com` } },
});

describe("cla", () => {
  it("passes and labels cla-signed when every author has signed", async () => {
    const rule = claCheck(() => fakeStore(["alice"]));
    const result = await runRule(rule, claContext({ commits: [userCommit("a1", "alice")] }));
    expect(result?.section?.status).toBe("pass");
    expect(result?.labels).toEqual(["cla-signed"]);
    expect(result?.removeLabels).toEqual(expect.arrayContaining(["cla-needed", "cla-error"]));
  });

  it("fails, labels cla-needed, and records pending signers for unsigned authors", async () => {
    const store = fakeStore(["alice"]);
    const rule = claCheck(() => store);
    const result = await runRule(
      rule,
      claContext({ commits: [userCommit("a1", "alice"), userCommit("b1", "bob")] }),
    );
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("@bob");
    expect(result?.section?.message).toContain("cla_sign_start");
    expect(result?.labels).toEqual(["cla-needed"]);
    expect(store.recordPendingSigners).toHaveBeenCalledWith([
      { login: "bob", shas: ["b1"], pr: { owner: "home-assistant", repo: "core", number: 1 } },
    ]);
  });

  it("fails with cla-error when a commit has no linked GitHub account", async () => {
    const rule = claCheck(() => fakeStore([]));
    const result = await runRule(
      rule,
      claContext({
        commits: [{ sha: "deadbeef123", author: null, commit: { author: { email: "x@y.z" } } }],
      }),
    );
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("deadbee");
    expect(result?.labels).toEqual(["cla-error"]);
  });

  it("passes without cla-signed when all commits are from bots", async () => {
    const rule = claCheck(() => fakeStore([]));
    const result = await runRule(
      rule,
      claContext({ commits: [{ sha: "a1", author: { login: "dep-bot", type: "Bot" } }] }),
    );
    expect(result?.section?.status).toBe("pass");
    expect(result?.labels).toBeUndefined();
  });

  it("re-checks and strips the label on cla-recheck", async () => {
    const rule = claCheck(() => fakeStore(["alice"]));
    const result = await runRule(
      rule,
      claContext({
        commits: [userCommit("a1", "alice")],
        eventType: EventType.PULL_REQUEST_LABELED,
        label: "cla-recheck",
      }),
    );
    expect(result?.section?.status).toBe("pass");
    expect(result?.removeLabels).toEqual(expect.arrayContaining(["cla-recheck"]));
  });

  it("ignores label events other than cla-recheck", async () => {
    const rule = claCheck(() => fakeStore(["alice"]));
    const result = await runRule(
      rule,
      claContext({
        commits: [userCommit("a1", "alice")],
        eventType: EventType.PULL_REQUEST_LABELED,
        label: "bugfix",
      }),
    );
    expect(result).toBeUndefined();
  });

  it("skips repositories without code", async () => {
    const rule = claCheck(() => fakeStore([]));
    const result = await runRule(
      rule,
      claContext({ commits: [userCommit("a1", "alice")], repository: "home-assistant/brands" }),
    );
    expect(result).toBeUndefined();
  });

  it("does nothing when the store is not configured", async () => {
    const rule = claCheck(() => undefined);
    const result = await runRule(rule, claContext({ commits: [userCommit("a1", "alice")] }));
    expect(result).toBeUndefined();
  });
});
