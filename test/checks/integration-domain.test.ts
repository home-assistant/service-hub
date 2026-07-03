import { describe, expect, it } from "vitest";
import { integrationDomain } from "../../src/checks/integration-domain.js";
import { EventType } from "../../src/engine/event.js";
import { createMockContext, mockPRFiles, runRule } from "../helpers/mock-context.js";

function makeFile(filename: string, overrides: { status?: string; additions?: number } = {}) {
  return {
    filename,
    status: overrides.status ?? "modified",
    additions: overrides.additions ?? 10,
    deletions: 0,
    changes: overrides.additions ?? 10,
    sha: "abc",
    blob_url: "",
    raw_url: "",
    contents_url: "",
  };
}

describe("integration-domain", () => {
  it("adds integration label for component files", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

    const result = await runRule(integrationDomain, context);
    expect(result?.labels).toContain("integration: hue");
  });

  it("caps integration labels at 5", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [
      makeFile("homeassistant/components/a/__init__.py"),
      makeFile("homeassistant/components/b/__init__.py"),
      makeFile("homeassistant/components/c/__init__.py"),
      makeFile("homeassistant/components/d/__init__.py"),
      makeFile("homeassistant/components/e/__init__.py"),
      makeFile("homeassistant/components/f/__init__.py"),
    ]);

    const result = await runRule(integrationDomain, context);
    expect(result?.labels).toBeUndefined();
  });

  it("returns nothing for an empty file list", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, []);

    const result = await runRule(integrationDomain, context);
    expect(result).toBeUndefined();
  });
});
