import { describe, expect, it } from "vitest";
import type { GuildRegistry } from "../../../src/discord/engine/dispatch.js";
import { dispatchDiscordEvent } from "../../../src/discord/engine/dispatch.js";
import type { DiscordEffect, Listener, SlashCommand } from "../../../src/discord/engine/types.js";
import {
  autocompleteEvent,
  commandEvent,
  HOME_ASSISTANT_GUILD,
  messageEvent,
  modalEvent,
  stubReader,
  user,
} from "../helpers/events.js";

function registry(commands: SlashCommand[] = [], listeners: Listener[] = []): GuildRegistry {
  return { guilds: { [HOME_ASSISTANT_GUILD]: { commands, listeners } } };
}

const reply: DiscordEffect = { type: "reply", content: "hi" };

describe("dispatchDiscordEvent", () => {
  it("runs the matching command", async () => {
    const command: SlashCommand = {
      name: "hello",
      description: "",
      handle: async () => [reply],
    };
    const effects = await dispatchDiscordEvent(
      registry([command]),
      commandEvent("hello"),
      stubReader(),
    );
    expect(effects).toEqual([reply]);
  });

  it("answers unknown commands ephemerally", async () => {
    const effects = await dispatchDiscordEvent(registry(), commandEvent("nope"), stubReader());
    expect(effects).toEqual([{ type: "reply", content: "Unknown command", ephemeral: true }]);
  });

  it("does not find another guild's commands", async () => {
    const command: SlashCommand = { name: "hello", description: "", handle: async () => [reply] };
    const effects = await dispatchDiscordEvent(
      registry([command]),
      commandEvent("hello", {}, { guildId: "999" }),
      stubReader(),
    );
    expect(effects).toEqual([{ type: "reply", content: "Unknown command", ephemeral: true }]);
  });

  it("acknowledges commands that stayed silent", async () => {
    const command: SlashCommand = {
      name: "quiet",
      description: "",
      handle: async () => [{ type: "sendMessage", channelId: "1", content: "side effect" }],
    };
    const effects = await dispatchDiscordEvent(
      registry([command]),
      commandEvent("quiet"),
      stubReader(),
    );
    expect(effects).toEqual([
      { type: "sendMessage", channelId: "1", content: "side effect" },
      { type: "reply", content: "Command completed", ephemeral: true },
    ]);
  });

  it("turns a handler error into an ephemeral reply", async () => {
    const command: SlashCommand = {
      name: "boom",
      description: "",
      handle: async () => {
        throw new Error("data source down");
      },
    };
    const effects = await dispatchDiscordEvent(
      registry([command]),
      commandEvent("boom"),
      stubReader(),
    );
    expect(effects).toEqual([{ type: "reply", content: "data source down", ephemeral: true }]);
  });

  it("drops events from bots", async () => {
    const command: SlashCommand = { name: "hello", description: "", handle: async () => [reply] };
    const effects = await dispatchDiscordEvent(
      registry([command]),
      commandEvent("hello", {}, { user: user({ isBot: true }) }),
      stubReader(),
    );
    expect(effects).toEqual([]);
  });

  it("routes autocomplete and answers errors with no choices", async () => {
    const command: SlashCommand = {
      name: "lookup",
      description: "",
      handle: async () => [reply],
      autocomplete: async () => {
        throw new Error("nope");
      },
    };
    const effects = await dispatchDiscordEvent(
      registry([command]),
      autocompleteEvent("lookup", { option: "q", value: "x" }),
      stubReader(),
    );
    expect(effects).toEqual([{ type: "autocomplete", choices: [] }]);
  });

  it("routes modal submits to the command owning the customId prefix", async () => {
    const command: SlashCommand = {
      name: "my",
      description: "",
      handle: async () => [reply],
      handleModal: async (context) => [
        { type: "reply", content: `submitted ${context.event.customId}` },
      ],
    };
    const effects = await dispatchDiscordEvent(
      registry([command]),
      modalEvent("my:config_flow_start", { domain: "hue" }),
      stubReader(),
    );
    expect(effects).toEqual([{ type: "reply", content: "submitted my:config_flow_start" }]);
  });

  it("isolates listener failures from other listeners", async () => {
    const broken: Listener = {
      name: "broken",
      description: "",
      events: {
        message_created: async () => {
          throw new Error("boom");
        },
      },
    };
    const working: Listener = {
      name: "working",
      description: "",
      events: {
        message_created: async () => [{ type: "deleteMessage", channelId: "1", messageId: "2" }],
      },
    };
    const effects = await dispatchDiscordEvent(
      registry([], [broken, working]),
      messageEvent("hello"),
      stubReader(),
    );
    expect(effects).toEqual([{ type: "deleteMessage", channelId: "1", messageId: "2" }]);
  });
});
