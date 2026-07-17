import { describe, expect, it } from "vitest";
import { dispatch } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import type { RegistryConfig } from "../../../src/github/engine/types.js";
import { integrationDomainsFromEvent } from "../../../src/github/manifests/home-assistant-core/helpers/integration-domains.js";
import { integrationDomain } from "../../../src/github/manifests/home-assistant-core/rules/integration-domain.js";
import { MENTION_MARKER, mentionCodeOwners } from "../../../src/github/rules/code-owner-mention.js";
import {
  createMockContext,
  createMockGitHub,
  createMockIssueContext,
  mockPRFiles,
  runRule,
} from "../helpers/mock-context.js";

const rule = mentionCodeOwners({
  domains: integrationDomainsFromEvent,
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
          labels: [{ name: "integration: hue" }],
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
          labels: [{ name: "integration: hue" }],
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result?.assignees).toContain("balloob");
    // Comment should be undefined since the only owner is already assigned
    expect(result?.comment).toBeUndefined();
  });

  it("does not post again when a mention comment already exists", async () => {
    const github = createMockGitHub();
    const codeowners = `homeassistant/components/hue/* @balloob`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    github.issues.listComments.mockResolvedValue({
      data: [
        {
          user: { login: "bot[bot]" },
          body: `${MENTION_MARKER}\n\nHey there @someone-else, mind taking a look?`,
        },
      ],
    });
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
          labels: [{ name: "integration: hue" }],
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
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
          labels: [{ name: "integration: hue" }],
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
  });

  it("raises when CODEOWNERS file is not found", async () => {
    const github = createMockGitHub();
    github.repos.getContent.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: { labels: [{ name: "integration: hue" }] },
      },
    });

    expect(runRule(rule, context)).rejects.toThrow("No CODEOWNERS file");
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
        issue: { labels: [{ name: "integration: hue" }] },
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

  describe("PR creation", () => {
    it("pings owners on pull_request.opened from the PR's own files", async () => {
      const github = createMockGitHub();
      const codeowners = `homeassistant/components/hue/* @balloob @frenck`;
      github.repos.getContent.mockResolvedValue({ data: { content: btoa(codeowners) } });
      github.issues.listComments.mockResolvedValue({ data: [] });
      github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

      const config: RegistryConfig = {
        repositories: { "home-assistant/core": [integrationDomain, rule] },
      };
      const context = createMockContext({
        registry: config,
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

      await dispatch(context);

      expect(github.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ["integration: hue"] }),
      );
      expect(github.issues.addAssignees).toHaveBeenCalledWith(
        expect.objectContaining({ assignees: expect.arrayContaining(["balloob", "frenck"]) }),
      );
      expect(github.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining("@balloob") }),
      );
    });

    it("does nothing on opened when the PR touches no integration files", async () => {
      const github = createMockGitHub();
      github.repos.getContent.mockResolvedValue({ data: { content: btoa("") } });

      const config: RegistryConfig = {
        repositories: { "home-assistant/core": [integrationDomain, rule] },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        payload: { pull_request: { user: { login: "contributor" }, labels: [] } },
      });
      mockPRFiles(context, [{ filename: "docs/README.md", status: "modified" }]);

      await dispatch(context);

      expect(github.issues.addAssignees).not.toHaveBeenCalled();
      expect(github.issues.createComment).not.toHaveBeenCalled();
    });

    it("subscribes to creation, change, and label events plus on_demand", () => {
      expect(Object.keys(rule.events).sort()).toEqual(
        [
          EventType.PULL_REQUEST_OPENED,
          EventType.PULL_REQUEST_EDITED,
          EventType.PULL_REQUEST_SYNCHRONIZE,
          EventType.ISSUES_OPENED,
          EventType.ISSUES_LABELED,
          EventType.PULL_REQUEST_LABELED,
          EventType.ON_DEMAND,
        ].sort(),
      );
    });
  });

  it("uses custom itemLabel in comment", async () => {
    const docsRule = mentionCodeOwners({
      domains: integrationDomainsFromEvent,
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
          labels: [{ name: "integration: hue" }],
        },
      },
    });

    const result = await runRule(docsRule, context);
    expect(result?.comment).toContain("feedback");
  });
});
