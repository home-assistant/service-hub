import { describe, expect, it } from "bun:test";
import { topic } from "../../../src/discord/commands/topic.js";
import { CommandContext } from "../../../src/discord/engine/context.js";
import { channel, commandEvent, stubReader } from "../helpers/events.js";

describe("/topic", () => {
  it("answers ephemerally when the channel has no topic", async () => {
    const context = new CommandContext(commandEvent("topic"), stubReader());
    expect(await topic.handle(context)).toEqual([
      { type: "reply", content: "This channel does not have a topic", ephemeral: true },
    ]);
  });

  it("posts the topic, prefixed with the tagged user", async () => {
    const context = new CommandContext(
      commandEvent(
        "topic",
        { user: "42" },
        { channel: channel({ topic: "Support for automations" }) },
      ),
      stubReader(),
    );
    expect(await topic.handle(context)).toEqual([
      {
        type: "reply",
        embeds: [
          {
            title: "The topic of this channel is:",
            description: "<@42> Support for automations",
          },
        ],
      },
    ]);
  });
});
