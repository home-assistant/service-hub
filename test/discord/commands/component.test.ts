import { beforeEach, describe, expect, it } from "bun:test";
import { component } from "../../../src/discord/commands/component.js";
import { CommandContext } from "../../../src/discord/engine/context.js";
import { commandEvent, ESPHOME_GUILD, stubReader } from "../helpers/events.js";
import { resetDataCaches, withRemote } from "../helpers/remote.js";

const REMOTE = {
  "esphome.io/components.json": {
    gpio: {
      title: "GPIO Switch",
      url: "https://esphome.io/components/switch/gpio.html",
      path: "components/switch/gpio",
    },
  },
};

beforeEach(resetDataCaches);

describe("/component", () => {
  it("renders the component embed", async () => {
    const context = new CommandContext(
      commandEvent("component", { component: "gpio" }, { guildId: ESPHOME_GUILD }),
      stubReader(),
    );
    expect(await withRemote(REMOTE, () => component.handle(context))).toEqual([
      {
        type: "reply",
        embeds: [
          {
            title: "GPIO Switch",
            image: undefined,
            fields: [
              {
                name: "Documentation",
                value: "[View the documentation](https://esphome.io/components/switch/gpio.html)",
                inline: true,
              },
              {
                name: "Source",
                value:
                  "[View the source on GitHub](https://github.com/esphome/esphome/tree/dev/esphome/components/switch/gpio)",
                inline: true,
              },
            ],
          },
        ],
      },
    ]);
  });

  it("answers ephemerally for unknown components", async () => {
    const context = new CommandContext(
      commandEvent("component", { component: "nope" }, { guildId: ESPHOME_GUILD }),
      stubReader(),
    );
    expect(await withRemote(REMOTE, () => component.handle(context))).toEqual([
      { type: "reply", content: "Could not find information", ephemeral: true },
    ]);
  });
});
