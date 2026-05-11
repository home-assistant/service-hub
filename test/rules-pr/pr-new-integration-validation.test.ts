import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prNewIntegrationValidation } from "../../src/rules-pr/pr-new-integration-validation.js";
import { createMockContext, mockPRFiles, runRule } from "../helpers/mock-context.js";

function makeFile(filename: string, status = "added") {
  return {
    filename,
    status,
    additions: 10,
    deletions: 0,
    changes: 10,
    sha: "abc",
    blob_url: "",
    raw_url: "",
    contents_url: "",
  };
}

describe("pr-new-integration-validation", () => {
  it("does nothing when label is not new-integration", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "bugfix" },
        pull_request: { head: { sha: "abc123" }, labels: [] },
      },
    });

    const result = await runRule(prNewIntegrationValidation, context);
    expect(result).toBeUndefined();
  });

  it("passes when new integration has single platform", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/config_flow.py"),
    ]);

    const result = await runRule(prNewIntegrationValidation, context);
    expect(result).toBeUndefined();
  });

  it("requests changes when multiple platforms added", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/light.py"),
    ]);

    const result = await runRule(prNewIntegrationValidation, context);
    expect(result?.requestChanges).toContain("limit included platforms to a single platform");
  });

  it("requests changes when brand folder is included", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/brand/icon.png"),
    ]);

    const result = await runRule(prNewIntegrationValidation, context);
    expect(result?.requestChanges).toContain("Brand assets should not be part of the core");
  });

  it("reports both issues when multiple platforms and brand folder", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/light.py"),
      makeFile("homeassistant/components/mydevice/brand/icon.png"),
    ]);

    const result = await runRule(prNewIntegrationValidation, context);
    expect(result?.requestChanges).toContain("limit included platforms");
    expect(result?.requestChanges).toContain("Brand assets");
  });

  it("listens only to labeled events", () => {
    expect(Object.keys(prNewIntegrationValidation.events)).toEqual([
      EventType.PULL_REQUEST_LABELED,
    ]);
  });
});
