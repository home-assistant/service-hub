import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prPlatinumCodeOwnerApproval } from "../../src/rules-pr/pr-platinum-code-owner-approval.js";
import { createMockContext, createMockGitHub } from "../helpers/mock-context.js";

describe("pr-platinum-code-owner-approval", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("succeeds when PR has no platinum label", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        pull_request: {
          labels: [{ name: "integration: hue" }, { name: "Quality Scale: gold" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await prPlatinumCodeOwnerApproval.handle(context);
    expect(result?.statusCheck?.state).toBe("success");
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

    const result = await prPlatinumCodeOwnerApproval.handle(context);
    expect(result?.statusCheck?.state).toBe("failure");
    expect(result?.statusCheck?.description).toContain("Code owner approval required");
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

    const result = await prPlatinumCodeOwnerApproval.handle(context);
    expect(result?.statusCheck?.state).toBe("success");
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

    const result = await prPlatinumCodeOwnerApproval.handle(context);
    expect(result?.statusCheck?.state).toBe("success");
  });

  it("succeeds when multiple integration labels (not single integration)", async () => {
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

    const result = await prPlatinumCodeOwnerApproval.handle(context);
    expect(result?.statusCheck?.state).toBe("success");
  });

  it("succeeds when manifest has no codeowners", async () => {
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

    const result = await prPlatinumCodeOwnerApproval.handle(context);
    expect(result?.statusCheck?.state).toBe("success");
  });

  it("listens to many PR events", () => {
    expect(prPlatinumCodeOwnerApproval.listens).toContain(EventType.PULL_REQUEST_LABELED);
    expect(prPlatinumCodeOwnerApproval.listens).toContain(EventType.PULL_REQUEST_REVIEW_SUBMITTED);
    expect(prPlatinumCodeOwnerApproval.listens).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
  });
});
