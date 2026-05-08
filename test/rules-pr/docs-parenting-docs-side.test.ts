import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { docsParentingDocsSide } from "../../src/rules-pr/docs-parenting-docs-side.js";
import { createMockContext } from "../helpers/mock-context.js";

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

describe("docs-parenting-docs-side", () => {
  it("labels docs PR with has-parent when linking to code repo", async () => {
    const context = docsContext({
      pull_request: {
        body: "Parent: home-assistant/core#1234",
        head: { sha: "abc123" },
      },
    });

    const result = await docsParentingDocsSide.handle(context);
    expect(result).toMatchObject({ labels: ["has-parent"] });
  });

  it("does nothing when docs PR has no code links", async () => {
    const context = docsContext({
      pull_request: {
        body: "Updated docs formatting",
        head: { sha: "abc123" },
      },
    });

    const result = await docsParentingDocsSide.handle(context);
    expect(result).toBeUndefined();
  });

  it("does not label when linking to self (docs repo)", async () => {
    const context = docsContext({
      pull_request: {
        body: "Related: home-assistant/home-assistant.io#500",
        head: { sha: "abc123" },
      },
    });

    const result = await docsParentingDocsSide.handle(context);
    expect(result).toBeUndefined();
  });

  it("listens to opened and edited events", () => {
    expect(docsParentingDocsSide.listens).toContain(EventType.PULL_REQUEST_OPENED);
    expect(docsParentingDocsSide.listens).toContain(EventType.PULL_REQUEST_EDITED);
  });
});
