import { describe, expect, it } from "vitest";
import { DiscordContext } from "../../../src/discord/engine/context.js";
import { lineCountEnforcer } from "../../../src/discord/listeners/line-count.js";
import { channel, messageEvent, stubReader, user } from "../helpers/events.js";

const handler = lineCountEnforcer.events.message_created;
if (!handler) throw new Error("listener must handle message_created");

function run(content: string, overrides: Parameters<typeof messageEvent>[1] = {}) {
  return handler(new DiscordContext(messageEvent(content, overrides), stubReader()));
}

const longLines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");

describe("line-count-enforcer", () => {
  it("ignores short messages", async () => {
    expect(await run("one\ntwo\nthree")).toBeUndefined();
  });

  it("ignores non-text channels", async () => {
    expect(await run(longLines, { channel: channel({ kind: "other" }) })).toBeUndefined();
  });

  it("exempts Admin and Mod roles", async () => {
    expect(await run(longLines, { user: user({ roleNames: ["Admin"] }) })).toBeUndefined();
  });

  it("reposts long messages as a file and deletes the original", async () => {
    const effects = await run(longLines, {
      channel: channel({ id: "42", name: "dev-core" }),
      user: user({ id: "7", username: "Pasty" }),
      messageId: "99",
    });
    expect(effects).toEqual([
      {
        type: "sendMessage",
        channelId: "42",
        content: "<@7> I converted your message into a file since it's above 15 lines :+1:",
        files: [{ name: "dev_core_pasty_99.txt", content: longLines }],
      },
      { type: "deleteMessage", channelId: "42", messageId: "99" },
    ]);
  });

  it("uses the code block's language as the file type", async () => {
    const body = Array.from({ length: 20 }, (_, i) => `key${i}: value`).join("\n");
    const effects = await run(`\`\`\`yaml\n${body}\n\`\`\``);
    expect(effects?.[0]).toMatchObject({
      type: "sendMessage",
      files: [{ name: expect.stringMatching(/\.yaml$/), content: body }],
    });
  });

  it("sniffs JSON in unlabeled code blocks", async () => {
    const body = `{\n${Array.from({ length: 20 }, (_, i) => `  "key${i}": ${i},`).join("\n")}\n  "end": true\n}`;
    const effects = await run(`\`\`\`\n${body}\n\`\`\``);
    expect(effects?.[0]).toMatchObject({
      type: "sendMessage",
      files: [{ name: expect.stringMatching(/\.json$/), content: body }],
    });
  });

  it("falls back to txt for unknown code block languages", async () => {
    const body = Array.from({ length: 20 }, (_, i) => `let x${i} = ${i};`).join("\n");
    const effects = await run(`\`\`\`rust\n${body}\n\`\`\``);
    expect(effects?.[0]).toMatchObject({
      type: "sendMessage",
      files: [{ name: expect.stringMatching(/\.txt$/), content: body }],
    });
  });
});
