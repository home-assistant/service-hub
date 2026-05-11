import { describe, expect, it } from "vitest";
import { EventType } from "../../src/github/types.js";
import { prLabelIntentsLanguage } from "../../src/rules-pr/pr-label-intents-language.js";
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

describe("pr-label-intents-language", () => {
  it("labels language from sentences directory", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("sentences/en/weather.yaml")]);

    const result = await runRule(prLabelIntentsLanguage, context);
    expect(result).toMatchObject({ labels: ["lang: en"] });
  });

  it("labels language from responses directory", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("responses/fr/something.yaml")]);

    const result = await runRule(prLabelIntentsLanguage, context);
    expect(result).toMatchObject({ labels: ["lang: fr"] });
  });

  it("labels language from tests directory", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("tests/de/test_weather.yaml")]);

    const result = await runRule(prLabelIntentsLanguage, context);
    expect(result).toMatchObject({ labels: ["lang: de"] });
  });

  it("deduplicates multiple files for the same language", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [
      makeFile("sentences/en/weather.yaml"),
      makeFile("sentences/en/lights.yaml"),
    ]);

    const result = await runRule(prLabelIntentsLanguage, context);
    expect(result?.labels).toHaveLength(1);
    expect(result?.labels).toContain("lang: en");
  });

  it("labels multiple languages", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [
      makeFile("sentences/en/weather.yaml"),
      makeFile("sentences/fr/weather.yaml"),
    ]);

    const result = await runRule(prLabelIntentsLanguage, context);
    expect(result?.labels).toHaveLength(2);
    expect(result?.labels).toContain("lang: en");
    expect(result?.labels).toContain("lang: fr");
  });

  it("returns undefined when no language files", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("README.md")]);

    const result = await runRule(prLabelIntentsLanguage, context);
    expect(result).toBeUndefined();
  });

  it("does not match non-yaml files", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("sentences/en/something.json")]);

    const result = await runRule(prLabelIntentsLanguage, context);
    expect(result).toBeUndefined();
  });

  it("does not allow bots", () => {
    expect(prLabelIntentsLanguage.allowBots).toBe(false);
  });
});
