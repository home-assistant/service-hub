import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { docsParenting } from "../../../../../src/github/manifests/home-assistant-io/rules/docs-parenting.js";
import { createMockContext, runRule } from "../../../helpers/mock-context.js";

function docsContext(body: string) {
  return createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: { pull_request: { body } },
  });
}

describe("docs-parenting (docs side)", () => {
  it("labels a docs PR whose body links a code PR", async () => {
    const result = await runRule(docsParenting, docsContext("Parent: home-assistant/core#123"));
    expect(result?.labels).toEqual(["has-parent"]);
  });

  it("ignores links to home-assistant.io itself", async () => {
    const result = await runRule(
      docsParenting,
      docsContext("Related: home-assistant/home-assistant.io#42"),
    );
    expect(result).toBeUndefined();
  });

  it("ignores links outside the home-assistant org", async () => {
    const result = await runRule(docsParenting, docsContext("See someuser/somerepo#7"));
    expect(result).toBeUndefined();
  });
});
