import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { issueIntegrationLinks } from "../../src/rules-issue/issue-integration-links.js";
import { createMockIssueContext } from "../helpers/mock-context.js";

describe("issue-integration-links", () => {
  it("posts documentation and source links for integration label", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      payload: {
        label: { name: "integration: hue" },
      },
    });

    const result = await issueIntegrationLinks.handle(context);
    expect(result?.comment).toContain(
      "[hue documentation](https://www.home-assistant.io/integrations/hue)",
    );
    expect(result?.comment).toContain(
      "[hue source](https://github.com/home-assistant/core/tree/dev/homeassistant/components/hue)",
    );
  });

  it("returns undefined for non-integration labels", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      payload: {
        label: { name: "bugfix" },
      },
    });

    const result = await issueIntegrationLinks.handle(context);
    expect(result).toBeUndefined();
  });

  it("returns undefined when no label in payload", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
    });

    const result = await issueIntegrationLinks.handle(context);
    expect(result).toBeUndefined();
  });

  it("extracts the domain correctly from label", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      payload: {
        label: { name: "integration: zwave_js" },
      },
    });

    const result = await issueIntegrationLinks.handle(context);
    expect(result?.comment).toContain("/integrations/zwave_js");
    expect(result?.comment).toContain("/components/zwave_js");
  });

  it("listens only to issues.labeled", () => {
    expect(issueIntegrationLinks.listens).toEqual([EventType.ISSUES_LABELED]);
  });
});
