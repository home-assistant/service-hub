import { describe, expect, it } from "vitest";
import { dependencyBump } from "../../src/checks/dependency-bump.js";
import { EventType } from "../../src/engine/event.js";
import { createMockContext, mockPRFiles, runRule } from "../helpers/mock-context.js";

function makeFile(filename: string) {
  return {
    filename,
    status: "modified",
    additions: 1,
    deletions: 0,
    changes: 1,
    sha: "abc",
    blob_url: "",
    raw_url: "",
    contents_url: "",
  };
}

describe("dependency-bump", () => {
  it("labels when all files are dependency files", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("requirements_all.txt"), makeFile("requirements_test_all.txt")]);

    const result = await runRule(dependencyBump, context);
    expect(result).toMatchObject({ labels: ["dependency-bump"] });
  });

  it("does not label when non-dependency files are included", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [
      makeFile("requirements_all.txt"),
      makeFile("homeassistant/components/hue/__init__.py"),
    ]);

    const result = await runRule(dependencyBump, context);
    expect(result).toBeUndefined();
  });

  it("does not label when no files", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, []);

    const result = await runRule(dependencyBump, context);
    expect(result).toBeUndefined();
  });

  it("matches nested dependency files by filename", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("some/path/package_constraints.txt")]);

    const result = await runRule(dependencyBump, context);
    expect(result).toMatchObject({ labels: ["dependency-bump"] });
  });
});
