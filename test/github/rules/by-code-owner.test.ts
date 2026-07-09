import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { byCodeOwner } from "../../../src/github/rules/by-code-owner.js";
import { createMockGitHub, createMockIssueContext, runRule } from "../helpers/mock-context.js";

const rule = byCodeOwner({
  pathPattern: (name) => `homeassistant/components/${name}/*`,
});

describe("by-code-owner", () => {
  it("labels items authored by a code owner", async () => {
    const github = createMockGitHub();
    const codeowners = `homeassistant/components/hue/* @reporter`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: {
          user: { login: "reporter" },
          labels: [{ name: "integration: hue" }],
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result?.labels).toContain("by-code-owner");
  });

  it("does nothing when the author is not a code owner", async () => {
    const github = createMockGitHub();
    const codeowners = `homeassistant/components/hue/* @balloob`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: {
          user: { login: "reporter" },
          labels: [{ name: "integration: hue" }],
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
  });
});
