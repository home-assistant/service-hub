import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { setDocumentationSection } from "../../../../../src/github/manifests/home-assistant-io/rules/set-documentation-section.js";
import {
  createMockGitHub,
  createMockIssueContext,
  runRule,
} from "../../../helpers/mock-context.js";

function issueContext(body: string, existingLabels: string[]) {
  const github = createMockGitHub();
  github.issues.getLabel.mockImplementation(async (params: { name?: string }) => {
    if (existingLabels.includes(params.name ?? "")) return { data: { name: params.name } };
    throw Object.assign(new Error("Not Found"), { status: 404 });
  });
  return createMockIssueContext({
    eventType: EventType.ISSUES_OPENED,
    github,
    payload: { issue: { body } },
  });
}

describe("set-documentation-section", () => {
  it("labels issues with sections that exist as repo labels", async () => {
    const result = await runRule(
      setDocumentationSection,
      issueContext("Broken page: https://www.home-assistant.io/docs/automation/", ["automation"]),
    );
    expect(result?.labels).toEqual(["automation"]);
  });

  it("skips integration pages entirely", async () => {
    const result = await runRule(
      setDocumentationSection,
      issueContext("https://www.home-assistant.io/integrations/hue/", ["integrations"]),
    );
    expect(result).toBeUndefined();
  });

  it("adds nothing when no section matches a label", async () => {
    const result = await runRule(
      setDocumentationSection,
      issueContext("https://www.home-assistant.io/docs/automation/", []),
    );
    expect(result).toBeUndefined();
  });
});
