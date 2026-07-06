import packageJson from "../../../package.json";
import type { SlashCommand } from "../engine/types.js";

export const info: SlashCommand = {
  name: "info",
  description: "Returns bot information",

  async handle() {
    return [
      {
        type: "reply" as const,
        embeds: [
          {
            fields: [
              { name: "Version", value: packageJson.version, inline: true },
              {
                name: "Source",
                value: "[Source Repository](https://github.com/home-assistant/service-hub)",
                inline: true,
              },
              {
                name: "Messages",
                value:
                  "[Data for the /message command](https://github.com/home-assistant/service-hub/tree/main/data/discord/messages)",
                inline: true,
              },
            ],
          },
        ],
      },
    ];
  },
};
