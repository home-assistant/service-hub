import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { homeAssistantIntents } from "../../../src/github/manifests/home-assistant-intents.js";
import { createMockContext, mockPRFiles, runRule } from "../helpers/mock-context.js";

const intentsLanguage = homeAssistantIntents.rules.find((r) => r.name === "intents-language");
if (!intentsLanguage) throw new Error("intents-language rule not registered");

function contextWithFiles(filenames: string[]) {
  const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
  mockPRFiles(
    context,
    filenames.map((filename) => ({ filename, status: "modified", additions: 1 })),
  );
  return context;
}

describe("intents-language", () => {
  it("labels PRs with every language they touch", async () => {
    const result = await runRule(
      intentsLanguage,
      contextWithFiles([
        "sentences/de/light_HassTurnOn.yaml",
        "responses/de/HassTurnOn.yaml",
        "tests/nl/light_HassTurnOn.yaml",
      ]),
    );
    expect(result?.labels).toEqual(expect.arrayContaining(["lang: de", "lang: nl"]));
    expect(result?.labels).toHaveLength(2);
  });

  it("ignores files outside the language folders", async () => {
    const result = await runRule(
      intentsLanguage,
      contextWithFiles(["script/setup.py", "README.md"]),
    );
    expect(result).toBeUndefined();
  });
});
