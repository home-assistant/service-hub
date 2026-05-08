import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { issueMentionCodeOwners } from "../../src/rules-issue/issue-mention-code-owners.js";
import { createMockGitHub, createMockIssueContext } from "../helpers/mock-context.js";

describe("issue-mention-code-owners", () => {
  it("returns undefined for non-integration labels", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      payload: {
        label: { name: "bugfix" },
      },
    });

    const result = await issueMentionCodeOwners.handle(context);
    expect(result).toBeUndefined();
  });

  it("assigns code owners and comments when integration is found", async () => {
    const github = createMockGitHub();
    const codeowners = `homeassistant/components/hue/* @balloob @frenck`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    github.issues.listComments.mockResolvedValue({ data: [] });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: {
          user: { login: "reporter" },
          assignees: [],
          body: "",
          labels: [],
        },
      },
    });

    const result = await issueMentionCodeOwners.handle(context);
    expect(result?.assignees).toContain("balloob");
    expect(result?.assignees).toContain("frenck");
    expect(result?.comment).toContain("@balloob");
    expect(result?.comment).toContain("@frenck");
    expect(result?.comment).toContain("code owner");
  });

  it("does not mention owners already assigned", async () => {
    const github = createMockGitHub();
    const codeowners = `homeassistant/components/hue/* @balloob`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    github.issues.listComments.mockResolvedValue({ data: [] });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: {
          user: { login: "reporter" },
          assignees: [{ login: "balloob" }],
          body: "",
          labels: [],
        },
      },
    });

    const result = await issueMentionCodeOwners.handle(context);
    expect(result?.assignees).toContain("balloob");
    // Comment should be undefined since the only owner is already assigned
    expect(result?.comment).toBeUndefined();
  });

  it("does not mention or assign the PR author", async () => {
    const github = createMockGitHub();
    const codeowners = `homeassistant/components/hue/* @reporter`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    github.issues.listComments.mockResolvedValue({ data: [] });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: {
          user: { login: "reporter" },
          assignees: [],
          body: "",
          labels: [],
        },
      },
    });

    const result = await issueMentionCodeOwners.handle(context);
    expect(result?.assignees).toEqual([]);
    expect(result?.labels).toContain("by-code-owner");
  });

  it("returns undefined when CODEOWNERS file is not found", async () => {
    const github = createMockGitHub();
    github.repos.getContent.mockRejectedValue(new Error("Not found"));

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
      },
    });

    const result = await issueMentionCodeOwners.handle(context);
    expect(result).toBeUndefined();
  });

  it("returns undefined when integration is not in CODEOWNERS", async () => {
    const github = createMockGitHub();
    const codeowners = `homeassistant/components/zwave/* @MartinHjelmare`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
      },
    });

    const result = await issueMentionCodeOwners.handle(context);
    expect(result).toBeUndefined();
  });

  it("works for PR labeled events too", async () => {
    expect(issueMentionCodeOwners.listens).toContain(EventType.PULL_REQUEST_LABELED);
  });

  it("listens to both issues.labeled and pull_request.labeled", () => {
    expect(issueMentionCodeOwners.listens).toContain(EventType.ISSUES_LABELED);
    expect(issueMentionCodeOwners.listens).toContain(EventType.PULL_REQUEST_LABELED);
  });
});
