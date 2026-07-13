import { describe, expect, it } from "vitest";
import type { RegistryConfig } from "../../../src/github/engine/dispatch.js";
import { dispatch } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import { fileShape } from "../../../src/github/rules/file-shape.js";
import { newIntegrationValidation } from "../../../src/github/rules/new-integration-validation.js";
import {
  createMockContext,
  createMockGitHub,
  mockPRFiles,
  runRule,
} from "../helpers/mock-context.js";

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
    expect(result?.section).toMatchObject({
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
    expect(result?.section).toMatchObject({
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
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("single platform");
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
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("brand");
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
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("single platform");
    expect(result?.section?.message).toContain("brand");
  });

  it("listens to labeled/unlabeled/synchronize/on_demand", () => {
    expect(Object.keys(newIntegrationValidation.events).sort()).toEqual(
      [
        EventType.PULL_REQUEST_LABELED,
        EventType.PULL_REQUEST_UNLABELED,
        EventType.PULL_REQUEST_SYNCHRONIZE,
        EventType.ON_DEMAND,
      ].sort(),
    );
  });

  it("fires on PR creation via the label loop when file-shape sets new-integration", async () => {
    const github = createMockGitHub();

    // Payload has no labels; file-shape derives `new-integration` from the
    // added __init__.py and the loop re-dispatches this rule with it.
    const config: RegistryConfig = {
      repositories: { "home-assistant/core": [fileShape, newIntegrationValidation] },
    };
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      payload: { pull_request: { labels: [] } },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/light.py"),
    ]);

    const effects = await dispatch(config, context);

    expect(effects).toContainEqual(
      expect.objectContaining({
        type: "statusSection",
        section: expect.objectContaining({
          id: "new-integration-validation",
          status: "fail",
          message: expect.stringContaining("single platform"),
        }),
      }),
    );
  });
});
