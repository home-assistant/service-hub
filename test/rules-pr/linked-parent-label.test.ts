import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { linkedParentLabel } from "../../src/rules-pr/linked-parent-label.js";
import { createMockContext } from "../helpers/mock-context.js";

const docsSideRule = linkedParentLabel({
  isParent: (link) => link.owner === "home-assistant" && link.repo !== "home-assistant.io",
});

function docsContext(overrides: Record<string, unknown> = {}) {
  return createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: {
      repository: {
        full_name: "home-assistant/home-assistant.io",
        name: "home-assistant.io",
        owner: { login: "home-assistant" },
      },
      ...overrides,
    },
  });
}

describe("linked-parent-label (docs-side configuration)", () => {
  it("labels docs PR with has-parent when linking to code repo", async () => {
    const context = docsContext({
      pull_request: {
        body: "Parent: home-assistant/core#1234",
        head: { sha: "abc123" },
        number: 1,
      },
    });

    const result = await docsSideRule.handle(context);
    expect(result).toMatchObject({ labels: ["has-parent"] });
  });

  it("does nothing when docs PR has no code links", async () => {
    const context = docsContext({
      pull_request: {
        body: "Updated docs formatting",
        head: { sha: "abc123" },
        number: 1,
      },
    });

    const result = await docsSideRule.handle(context);
    expect(result).toBeUndefined();
  });

  it("does not label when linking to self (docs repo)", async () => {
    const context = docsContext({
      pull_request: {
        body: "Related: home-assistant/home-assistant.io#500",
        head: { sha: "abc123" },
        number: 1,
      },
    });

    const result = await docsSideRule.handle(context);
    expect(result).toBeUndefined();
  });

  it("listens to opened and edited events", () => {
    expect(docsSideRule.listens).toContain(EventType.PULL_REQUEST_OPENED);
    expect(docsSideRule.listens).toContain(EventType.PULL_REQUEST_EDITED);
  });

  it("supports custom label", async () => {
    const rule = linkedParentLabel({
      isParent: (link) => link.owner === "acme",
      label: "linked-acme",
    });
    const context = docsContext({
      pull_request: {
        body: "See acme/widget#1",
        head: { sha: "abc" },
        number: 2,
      },
    });
    const result = await rule.handle(context);
    expect(result).toMatchObject({ labels: ["linked-acme"] });
  });
});
