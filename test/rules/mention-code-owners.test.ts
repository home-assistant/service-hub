import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { mentionCodeOwners } from "../../src/rules/mention-code-owners.js";
import {
  createMockContext,
  createMockGitHub,
  createMockIssueContext,
  mockPRFiles,
  runRule,
} from "../helpers/mock-context.js";

const rule = mentionCodeOwners({
  pathPattern: (name) => `homeassistant/components/${name}/*`,
});

describe("mention-code-owners", () => {
  it("returns undefined for non-integration labels", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      payload: {
        label: { name: "bugfix" },
      },
    });

    const result = await runRule(rule, context);
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

    const result = await runRule(rule, context);
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

    const result = await runRule(rule, context);
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

    const result = await runRule(rule, context);
    expect(result?.assignees).toBeUndefined();
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

    const result = await runRule(rule, context);
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

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
  });

  it("works for PR labeled events too", async () => {
    expect(Object.keys(rule.events)).toContain(EventType.PULL_REQUEST_LABELED);
  });

  it("listens to both issues.labeled and pull_request.labeled", () => {
    expect(Object.keys(rule.events)).toContain(EventType.ISSUES_LABELED);
    expect(Object.keys(rule.events)).toContain(EventType.PULL_REQUEST_LABELED);
  });

  describe("PR file-driven triggers", () => {
    it("pings owners on pull_request.opened based on changed files", async () => {
      const github = createMockGitHub();
      const codeowners = `homeassistant/components/hue/* @balloob @frenck`;
      github.repos.getContent.mockResolvedValue({ data: { content: btoa(codeowners) } });
      github.issues.listComments.mockResolvedValue({ data: [] });
      github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        payload: {
          pull_request: {
            user: { login: "contributor" },
            assignees: [],
            body: "",
            labels: [],
          },
        },
      });
      mockPRFiles(context, [
        { filename: "homeassistant/components/hue/light.py", status: "modified" },
      ]);

      const result = await runRule(rule, context);
      expect(result?.assignees).toContain("balloob");
      expect(result?.assignees).toContain("frenck");
      expect(result?.comment).toContain("@balloob");
    });

    it("returns undefined when the PR touches no integration files", async () => {
      const github = createMockGitHub();
      github.repos.getContent.mockResolvedValue({ data: { content: btoa("") } });

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        payload: { pull_request: { user: { login: "contributor" }, labels: [] } },
      });
      mockPRFiles(context, [{ filename: "docs/README.md", status: "modified" }]);

      const result = await runRule(rule, context);
      expect(result).toBeUndefined();
    });

    it("also fires on pull_request.synchronize", async () => {
      const github = createMockGitHub();
      const codeowners = `homeassistant/components/hue/* @balloob`;
      github.repos.getContent.mockResolvedValue({ data: { content: btoa(codeowners) } });
      github.issues.listComments.mockResolvedValue({ data: [] });
      github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
        github,
        payload: {
          pull_request: {
            user: { login: "contributor" },
            assignees: [],
            body: "",
            labels: [],
          },
        },
      });
      mockPRFiles(context, [
        { filename: "homeassistant/components/hue/sensor.py", status: "added" },
      ]);

      const result = await runRule(rule, context);
      expect(result?.assignees).toContain("balloob");
    });

    it("subscribes to opened, reopened, and synchronize", () => {
      expect(Object.keys(rule.events)).toContain(EventType.PULL_REQUEST_OPENED);
      expect(Object.keys(rule.events)).toContain(EventType.PULL_REQUEST_REOPENED);
      expect(Object.keys(rule.events)).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
    });
  });

  it("uses custom itemLabel in comment", async () => {
    const docsRule = mentionCodeOwners({
      pathPattern: (name) => `source/_integrations/${name}.markdown`,
      itemLabel: "feedback",
    });

    const github = createMockGitHub();
    const codeowners = `source/_integrations/hue.markdown @balloob`;

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
        repository: {
          full_name: "home-assistant/home-assistant.io",
          name: "home-assistant.io",
          owner: { login: "home-assistant" },
        },
        issue: {
          user: { login: "reporter" },
          assignees: [],
          body: "",
          labels: [],
        },
      },
    });

    const result = await runRule(docsRule, context);
    expect(result?.comment).toContain("feedback");
  });
});
