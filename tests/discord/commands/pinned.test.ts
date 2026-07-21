import { describe, expect, it } from "vitest";
import { pinned } from "../../../src/discord/commands/pinned.js";
import { CommandContext } from "../../../src/discord/engine/context.js";
import { commandEvent, stubReader } from "../helpers/events.js";

describe("/pinned", () => {
  it("answers ephemerally when nothing is pinned", async () => {
    const context = new CommandContext(commandEvent("pinned"), stubReader([]));
    expect(await pinned.handle(context)).toEqual([
      { type: "reply", content: "No pinned messages in this channel", ephemeral: true },
    ]);
  });

  it("lists pinned messages with sanitized, truncated previews", async () => {
    const context = new CommandContext(
      commandEvent("pinned"),
      stubReader([
        {
          content: "Read the <rules>\nbefore posting: https://example.com",
          url: "https://discord.com/1",
        },
        { content: "x".repeat(80), url: "https://discord.com/2" },
        { content: "", url: "https://discord.com/3" },
      ]),
    );
    expect(await pinned.handle(context)).toEqual([
      {
        type: "reply",
        embeds: [
          {
            title: "The pinned messages of this channel are:",
            description: [
              `- ["Read the rules before posting: example.com"](<https://discord.com/1>)`,
              `- ["${"x".repeat(64)}..."](<https://discord.com/2>)`,
              `- ["embeded content"](<https://discord.com/3>)`,
            ].join("\n"),
          },
        ],
      },
    ]);
  });
});
