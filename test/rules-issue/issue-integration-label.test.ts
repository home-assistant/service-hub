import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { issueIntegrationLabel } from "../../src/rules-issue/issue-integration-label.js";
import { createMockGitHub, createMockIssueContext, runRule } from "../helpers/mock-context.js";

describe("issue-integration-label", () => {
  it("adds integration label when documentation link found and label exists", async () => {
    const github = createMockGitHub();
    github.issues.getLabel.mockResolvedValue({
      status: 200,
      data: { name: "integration: hue" },
    });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_OPENED,
      github,
      payload: {
        issue: {
          body: "https://www.home-assistant.io/integrations/hue",
          user: { login: "testuser" },
          assignees: [],
          labels: [],
        },
      },
    });

    const result = await runRule(issueIntegrationLabel, context);
    expect(result?.labels).toContain("integration: hue");
  });

  it("returns undefined when no documentation links", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_OPENED,
      payload: {
        issue: {
          body: "Something is broken",
          user: { login: "testuser" },
          assignees: [],
          labels: [],
        },
      },
    });

    const result = await runRule(issueIntegrationLabel, context);
    expect(result).toBeUndefined();
  });

  it("returns undefined when label does not exist in repo", async () => {
    const github = createMockGitHub();
    github.issues.getLabel.mockRejectedValue(new Error("Not found"));

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_OPENED,
      github,
      payload: {
        issue: {
          body: "https://www.home-assistant.io/integrations/unknowndevice",
          user: { login: "testuser" },
          assignees: [],
          labels: [],
        },
      },
    });

    const result = await runRule(issueIntegrationLabel, context);
    expect(result).toBeUndefined();
  });

  it("uses platform name when integration is an entity platform", async () => {
    const github = createMockGitHub();
    // "light" is an entity platform, so when integration=light and platform=hue,
    // it resolves to the platform (hue)
    github.issues.getLabel.mockResolvedValue({
      status: 200,
      data: { name: "integration: hue" },
    });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_OPENED,
      github,
      payload: {
        issue: {
          body: "https://www.home-assistant.io/integrations/light.hue",
          user: { login: "testuser" },
          assignees: [],
          labels: [],
        },
      },
    });

    const result = await runRule(issueIntegrationLabel, context);
    expect(result?.labels).toContain("integration: hue");
  });

  it("does not allow bots", () => {
    expect(issueIntegrationLabel.allowBots).toBe(false);
  });

  it("listens only to issues.opened", () => {
    expect(Object.keys(issueIntegrationLabel.events)).toEqual([EventType.ISSUES_OPENED]);
  });
});
