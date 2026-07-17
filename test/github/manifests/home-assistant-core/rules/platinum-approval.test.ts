import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatch } from "../../../../../src/github/engine/dispatch.js";
import { EventType } from "../../../../../src/github/engine/event.js";
import type { RegistryConfig } from "../../../../../src/github/engine/types.js";
import { integrationDomain } from "../../../../../src/github/manifests/home-assistant-core/rules/integration-domain.js";
import { platinumApproval } from "../../../../../src/github/manifests/home-assistant-core/rules/platinum-approval.js";
import { qualityScale } from "../../../../../src/github/manifests/home-assistant-core/rules/quality-scale.js";
import {
  createMockContext,
  createMockGitHub,
  mockPRFiles,
  runRule,
} from "../../../helpers/mock-context.js";

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
      eventType: EventType.ON_DEMAND,
      payload: {
        pull_request: {
          labels: [{ name: "integration: hue" }, { name: "Quality Scale: gold" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(platinumApproval, context);
    expect(result?.section?.status).toBe("skip");
  });

  it("is pending when platinum integration has no code owner approval", async () => {
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
      eventType: EventType.ON_DEMAND,
      github,
      payload: {
        pull_request: {
          labels: [{ name: "integration: hue" }, { name: "Quality Scale: platinum" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(platinumApproval, context);
    expect(result?.section?.status).toBe("pending");
    expect(result?.section?.message).toContain("needs approval from a code owner");
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
      eventType: EventType.ON_DEMAND,
      github,
      payload: {
        pull_request: {
          labels: [{ name: "integration: hue" }, { name: "Quality Scale: platinum" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(platinumApproval, context);
    expect(result?.section?.status).toBe("pass");
    expect(result?.labels).toContain("code-owner-approved");
  });

  it("removes the approval label when the owner approval was dismissed", async () => {
    const github = createMockGitHub();
    github.pulls.listReviews.mockResolvedValue({
      data: [{ state: "DISMISSED", user: { login: "balloob", type: "User" } }],
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
      eventType: EventType.PULL_REQUEST_REVIEW_DISMISSED,
      github,
      payload: {
        pull_request: {
          labels: [
            { name: "integration: hue" },
            { name: "Quality Scale: platinum" },
            { name: "code-owner-approved" },
          ],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(platinumApproval, context);
    expect(result?.section?.status).toBe("pending");
    expect(result?.removeLabels).toContain("code-owner-approved");
  });

  it("succeeds when the author is a code owner", async () => {
    const github = createMockGitHub();
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        domain: "hue",
        name: "Hue",
        codeowners: ["@testuser"],
        quality_scale: "platinum",
        config_flow: true,
        dependencies: [],
        documentation: "",
        requirements: [],
        iot_class: "local_polling",
      }),
    });

    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      github,
      payload: {
        pull_request: {
          labels: [{ name: "integration: hue" }],
          user: { login: "testuser" },
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(platinumApproval, context);
    expect(result?.section?.status).toBe("pass");
    expect(result?.section?.message).toContain("Authored by a code owner");
  });

  it("skips when multiple integration labels (not single integration)", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
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
    expect(result?.section?.status).toBe("skip");
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
      eventType: EventType.ON_DEMAND,
      github,
      payload: {
        pull_request: {
          labels: [{ name: "integration: hue" }, { name: "Quality Scale: platinum" }],
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(platinumApproval, context);
    expect(result?.section?.status).toBe("skip");
  });

  it("listens to PR state, label, and review events plus on_demand", () => {
    expect(Object.keys(platinumApproval.events).sort()).toEqual(
      [
        EventType.PULL_REQUEST_OPENED,
        EventType.PULL_REQUEST_REOPENED,
        EventType.PULL_REQUEST_SYNCHRONIZE,
        EventType.PULL_REQUEST_LABELED,
        EventType.PULL_REQUEST_UNLABELED,
        EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        EventType.PULL_REQUEST_REVIEW_DISMISSED,
        EventType.ON_DEMAND,
      ].sort(),
    );
  });

  it("fires on PR creation, deriving everything from the PR itself", async () => {
    const github = createMockGitHub();
    github.pulls.listReviews.mockResolvedValue({ data: [] });
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

    // No platinum-relevant labels on the payload — the rule derives the
    // domain from the changed files and the scale from the manifest itself.
    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [integrationDomain, qualityScale, platinumApproval] },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      payload: { pull_request: { labels: [] } },
    });
    mockPRFiles(context, [
      { filename: "homeassistant/components/hue/light.py", status: "modified" },
    ]);

    const effects = await dispatch(context);

    expect(effects).toContainEqual(
      expect.objectContaining({
        type: "statusSection",
        section: expect.objectContaining({ id: "code-owner-approval", status: "pending" }),
      }),
    );
    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: expect.arrayContaining(["integration: hue", "Quality Scale: platinum"]),
      }),
    );
  });
});
