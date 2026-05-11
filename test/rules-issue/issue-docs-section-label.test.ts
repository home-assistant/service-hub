import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { issueDocsSectionLabel } from "../../src/rules-issue/issue-docs-section-label.js";
import { createMockGitHub, createMockIssueContext, runRule } from "../helpers/mock-context.js";

describe("issue-docs-section-label", () => {
  it("adds section label when documentation link found", async () => {
    const github = createMockGitHub();
    github.issues.getLabel.mockResolvedValue({
      status: 200,
      data: { name: "getting-started" },
    });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_OPENED,
      github,
      payload: {
        issue: {
          body: "https://www.home-assistant.io/getting-started/",
          user: { login: "testuser" },
          assignees: [],
          labels: [],
        },
      },
    });

    const result = await runRule(issueDocsSectionLabel, context);
    expect(result?.labels).toContain("getting-started");
  });

  it("skips when integrations section is found", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_OPENED,
      payload: {
        issue: {
          body: "https://www.home-assistant.io/integrations/hue",
          user: { login: "testuser" },
          assignees: [],
          labels: [],
        },
      },
    });

    const result = await runRule(issueDocsSectionLabel, context);
    expect(result).toBeUndefined();
  });

  it("returns undefined when no docs links in body", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_OPENED,
      payload: {
        issue: {
          body: "Just regular text",
          user: { login: "testuser" },
          assignees: [],
          labels: [],
        },
      },
    });

    const result = await runRule(issueDocsSectionLabel, context);
    expect(result).toBeUndefined();
  });

  it("returns undefined when section label does not exist in repo", async () => {
    const github = createMockGitHub();
    github.issues.getLabel.mockRejectedValue(new Error("Not found"));

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_OPENED,
      github,
      payload: {
        issue: {
          body: "https://www.home-assistant.io/docs/",
          user: { login: "testuser" },
          assignees: [],
          labels: [],
        },
      },
    });

    const result = await runRule(issueDocsSectionLabel, context);
    expect(result).toBeUndefined();
  });

  it("does not allow bots", () => {
    expect(issueDocsSectionLabel.allowBots).toBe(false);
  });

  it("listens only to issues.opened", () => {
    expect(Object.keys(issueDocsSectionLabel.events)).toEqual([EventType.ISSUES_OPENED]);
  });
});
