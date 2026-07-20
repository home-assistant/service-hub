import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { message } from "../../../src/discord/commands/message.js";
import { setMessageFileReader } from "../../../src/discord/data/messages.js";
import { CommandContext, DiscordContext } from "../../../src/discord/engine/context.js";
import { autocompleteEvent, commandEvent, stubReader } from "../helpers/events.js";
import { resetDataCaches } from "../helpers/remote.js";

const COMMON_YAML = `
templates:
  description: Templating documentation
  title: Templates
  content: See the templating docs
  image: https://example.com/templates.png
`;

const HA_YAML = `
logs:
  description: How to get your logs
  content: "Settings -> System -> Logs"
  fields:
    - name: Docs
      value: https://example.com/logs
`;

const FILES: Record<string, string> = {
  "common.yaml": COMMON_YAML,
  "homeassistant.yaml": HA_YAML,
};

beforeEach(() => {
  resetDataCaches();
  setMessageFileReader((file) => FILES[file] ?? "");
});

afterEach(() => setMessageFileReader(null));

describe("/message", () => {
  it("posts the guild-merged message with mention, image, and inline fields", async () => {
    const context = new CommandContext(
      commandEvent("message", { message: "logs", user: "42" }),
      stubReader(),
    );
    expect(await message.handle(context)).toEqual([
      {
        type: "reply",
        embeds: [
          {
            title: undefined,
            description: "<@42> Settings -> System -> Logs",
            image: undefined,
            fields: [{ name: "Docs", value: "https://example.com/logs", inline: true }],
          },
        ],
      },
    ]);
  });

  it("answers ephemerally for unknown keys", async () => {
    const context = new CommandContext(commandEvent("message", { message: "nope" }), stubReader());
    expect(await message.handle(context)).toEqual([
      { type: "reply", content: "Could not find information", ephemeral: true },
    ]);
  });

  it("reloads the message list on demand", async () => {
    const context = new CommandContext(
      commandEvent("message", { message: "reload" }),
      stubReader(),
    );
    expect(await message.handle(context)).toEqual([
      { type: "reply", content: "Message list reloaded", ephemeral: true },
    ]);
  });

  it("suggests matches on name and key", async () => {
    const context = new DiscordContext(
      autocompleteEvent("message", { option: "message", value: "temp" }),
      stubReader(),
    );
    expect((await message.autocomplete?.(context)) ?? []).toEqual([
      { name: "Templating documentation", value: "templates" },
    ]);
  });

  it("suggests nothing until the user types", async () => {
    const context = new DiscordContext(
      autocompleteEvent("message", { option: "message", value: "" }),
      stubReader(),
    );
    expect((await message.autocomplete?.(context)) ?? []).toEqual([]);
  });
});
