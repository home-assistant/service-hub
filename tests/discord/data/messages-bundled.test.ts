import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMessageFile } from "../../../src/discord/data/messages.js";

// The real message YAML is bundled and read at runtime, but the command and
// manifest tests exercise only stub data — so nothing else checks that the
// shipped files parse and match the schema. This does.
const dir = new URL("../../../src/discord/messages/", import.meta.url);
const files = readdirSync(dir).filter((file) => file.endsWith(".yaml"));

describe("bundled Discord message files", () => {
  it("finds message files to validate", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s parses and matches the message schema", (file) => {
    const raw = readFileSync(new URL(file, dir), "utf8");
    expect(() => parseMessageFile(raw)).not.toThrow();
  });
});
