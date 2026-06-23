import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platinumApproval } from "../../src/checks/platinum-approval.js";
import { EventType } from "../../src/github/types.js";
import { createMockContext, createMockGitHub, runRule } from "../helpers/mock-context.js";

describe("platinum-approval", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("skips when PR has no platinum label", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [{ name: "integration: hue" }, { name: "Quality Scale: gold" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(platinumApproval, context);
    expect(result?.dashboard?.status).toBe("skip");
  });

  it("fails when platinum integration has no code owner approval", async () => {
    const github = createMockGitHub();
    github.pulls.listReviews.mockResolvedValue({ data: [] });

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        domain: "hue",
        name: "Hue",
        codeowners: ["@balloob"],
        quality_scale: "platinum",
        config_flow: true,
        dependencies: [],
        documentation: "",
        requirements: [],
        iot_class: "local_polling",
      }),
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      github,
      payload: {
        pull_request: {
          labels: [{ name: "integration: hue" }, { name: "Quality Scale: platinum" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(platinumApproval, context);
    expect(result?.dashboard?.status).toBe("fail");
    expect(result?.dashboard?.message).toContain("needs approval from a code owner");
  });

  it("succeeds when code owner has approved", async () => {
    const github = createMockGitHub();
    github.pulls.listReviews.mockResolvedValue({
      data: [{ state: "APPROVED", user: { login: "balloob", type: "User" } }],
    });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        domain: "hue",
        name: "Hue",
        codeowners: ["@balloob"],
        quality_scale: "platinum",
        config_flow: true,
        dependencies: [],
        documentation: "",
        requirements: [],
        iot_class: "local_polling",
      }),
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      github,
      payload: {
        pull_request: {
          labels: [{ name: "integration: hue" }, { name: "Quality Scale: platinum" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(platinumApproval, context);
    expect(result?.dashboard?.status).toBe("pass");
    expect(result?.labels).toContain("code-owner-approved");
  });

  it("succeeds when by-code-owner label is present", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [
            { name: "integration: hue" },
            { name: "Quality Scale: platinum" },
            { name: "by-code-owner" },
          ],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(platinumApproval, context);
    expect(result?.dashboard?.status).toBe("pass");
  });

  it("skips when multiple integration labels (not single integration)", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [
            { name: "integration: hue" },
            { name: "integration: zwave" },
            { name: "Quality Scale: platinum" },
          ],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(platinumApproval, context);
    expect(result?.dashboard?.status).toBe("skip");
  });

  it("skips when manifest has no codeowners", async () => {
    const github = createMockGitHub();
    github.pulls.listReviews.mockResolvedValue({ data: [] });

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        domain: "hue",
        name: "Hue",
        codeowners: [],
        quality_scale: "platinum",
        config_flow: true,
        dependencies: [],
        documentation: "",
        requirements: [],
        iot_class: "local_polling",
      }),
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      github,
      payload: {
        pull_request: {
          labels: [{ name: "integration: hue" }, { name: "Quality Scale: platinum" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(platinumApproval, context);
    expect(result?.dashboard?.status).toBe("skip");
  });

  it("listens to many PR events", () => {
    expect(Object.keys(platinumApproval.events)).toContain(EventType.PULL_REQUEST_LABELED);
    expect(Object.keys(platinumApproval.events)).toContain(EventType.PULL_REQUEST_REVIEW_SUBMITTED);
    expect(Object.keys(platinumApproval.events)).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
  });
});
