import { describe, expect, it } from "vitest";
import { newIntegrationValidation } from "../../src/checks/new-integration-validation.js";
import { EventType } from "../../src/github/types.js";
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

describe("new-integration-validation", () => {
  it("skips when PR has no new-integration label", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "bugfix" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "bugfix" }] },
      },
    });

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.dashboard).toMatchObject({
      id: "new-integration-validation",
      status: "skip",
    });
  });

  it("passes when new-integration PR has a single platform", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/config_flow.py"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.dashboard).toMatchObject({
      id: "new-integration-validation",
      status: "pass",
    });
  });

  it("fails when multiple platforms added", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/light.py"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.dashboard?.status).toBe("fail");
    expect(result?.dashboard?.message).toContain("single platform");
  });

  it("fails when brand folder is included", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/brand/icon.png"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.dashboard?.status).toBe("fail");
    expect(result?.dashboard?.message).toContain("brand");
  });

  it("reports both issues when multiple platforms AND brand folder", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/light.py"),
      makeFile("homeassistant/components/mydevice/brand/icon.png"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.dashboard?.status).toBe("fail");
    expect(result?.dashboard?.message).toContain("single platform");
    expect(result?.dashboard?.message).toContain("brand");
  });

  it("listens to opened/reopened/labeled/unlabeled/synchronize", () => {
    const keys = Object.keys(newIntegrationValidation.events);
    expect(keys).toContain(EventType.PULL_REQUEST_OPENED);
    expect(keys).toContain(EventType.PULL_REQUEST_LABELED);
    expect(keys).toContain(EventType.PULL_REQUEST_UNLABELED);
    expect(keys).toContain(EventType.PULL_REQUEST_SYNCHRONIZE);
  });
});
