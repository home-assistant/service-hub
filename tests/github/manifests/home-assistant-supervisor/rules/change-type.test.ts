import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { changeType } from "../../../../../src/github/manifests/home-assistant-supervisor/rules/change-type.js";
import { createMockContext, runRule } from "../../../helpers/mock-context.js";

function supervisorContext(opts: {
  body?: string;
  labels?: string[];
  eventType?: EventType;
  eventLabel?: string;
}) {
  return createMockContext({
    eventType: opts.eventType ?? EventType.PULL_REQUEST_OPENED,
    payload: {
      action: opts.eventType === EventType.PULL_REQUEST_LABELED ? "labeled" : "opened",
      ...(opts.eventLabel ? { label: { name: opts.eventLabel } } : {}),
      pull_request: {
        body: opts.body ?? "",
        labels: (opts.labels ?? []).map((name) => ({ name })),
      },
    },
  });
}

describe("supervisor change-type", () => {
  it("labels the PR from checked template boxes and passes", async () => {
    const result = await runRule(
      changeType,
      supervisorContext({ body: "- [x] Bugfix (non-breaking change which fixes an issue)" }),
    );
    expect(result?.labels).toEqual(["bugfix"]);
    expect(result?.section?.status).toBe("pass");
  });

  it("fails when nothing is checked and no accepted label is present", async () => {
    const result = await runRule(changeType, supervisorContext({ body: "no boxes here" }));
    expect(result?.section?.status).toBe("fail");
  });

  it("accepts manually applied labels outside the template vocabulary", async () => {
    const result = await runRule(changeType, supervisorContext({ labels: ["ci"] }));
    expect(result?.section?.status).toBe("pass");
    expect(result?.labels).toBeUndefined();
  });

  it("removes stale body-derived labels when the body changes", async () => {
    const result = await runRule(
      changeType,
      supervisorContext({
        body: "- [x] Bugfix (non-breaking change which fixes an issue)",
        labels: ["new-feature"],
      }),
    );
    expect(result?.labels).toEqual(["bugfix"]);
    expect(result?.removeLabels).toEqual(["new-feature"]);
  });

  it("skips label events for labels that don't feed the check", async () => {
    const result = await runRule(
      changeType,
      supervisorContext({
        eventType: EventType.PULL_REQUEST_LABELED,
        eventLabel: "stale",
      }),
    );
    expect(result).toBeUndefined();
  });
});
