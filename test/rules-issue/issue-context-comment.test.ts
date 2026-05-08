import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { issueContextComment } from "../../src/rules-issue/issue-context-comment.js";
import { createMockIssueContext } from "../helpers/mock-context.js";

describe("issue-context-comment", () => {
  it("posts default integration message for integration labels", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      payload: {
        label: { name: "integration: hue" },
        issue: { user: { login: "reporter" }, body: "", assignees: [], labels: [] },
      },
    });

    const result = await issueContextComment.handle(context);
    expect(result?.comment).toContain("@reporter");
    expect(result?.comment).toContain("Thanks for reporting this issue!");
    expect(result?.comment).toContain("label%3A%22integration%3A%20hue%22");
  });

  it("posts context for 'custom integration' label", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      payload: {
        label: { name: "custom integration" },
        issue: { user: { login: "user123" }, body: "", assignees: [], labels: [] },
      },
    });

    const result = await issueContextComment.handle(context);
    expect(result?.comment).toContain("@user123");
    expect(result?.comment).toContain("custom integration");
  });

  it("returns undefined for non-integration non-context labels", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      payload: {
        label: { name: "bugfix" },
        issue: { user: { login: "user" }, body: "", assignees: [], labels: [] },
      },
    });

    const result = await issueContextComment.handle(context);
    expect(result).toBeUndefined();
  });

  it("returns undefined when no label in payload", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
    });

    const result = await issueContextComment.handle(context);
    expect(result).toBeUndefined();
  });

  it("listens only to issues.labeled", () => {
    expect(issueContextComment.listens).toEqual([EventType.ISSUES_LABELED]);
  });
});
