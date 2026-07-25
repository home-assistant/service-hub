import { getIntegration, loadIntegrations, type ReleaseChannel } from "../data/integrations.js";
import { filterChoices } from "../engine/autocomplete.js";
import type { SlashCommand } from "../engine/types.js";

/** #beta in the Home Assistant guild — data comes from rc.home-assistant.io there. */
const BETA_CHANNEL_ID = "427516175237382144";

const QUALITY_SCALE_LABEL: Record<string, string> = {
  no_score: "No score",
  silver: ":second_place: Silver",
  gold: ":first_place: Gold",
  platinum: ":trophy: Platinum",
  internal: ":house: Internal",
};

function releaseChannel(channelId: string): ReleaseChannel {
  return channelId === BETA_CHANNEL_ID ? "beta" : "stable";
}

export const integration: SlashCommand = {
  name: "integration",
  description: "Returns information about an integration",
  options: [
    {
      name: "integration",
      description: "What is the name of the integration?",
      required: true,
      autocomplete: true,
    },
  ],

  async handle(context) {
    const domain = context.option("integration") ?? "";
    const channel = releaseChannel(context.channel.id);

    if (domain === "reload") {
      await loadIntegrations(channel, true);
      return [{ type: "reply" as const, content: "Integration list reloaded", ephemeral: true }];
    }

    const data = await getIntegration(domain, channel);
    if (!data) {
      return [{ type: "reply" as const, content: "Could not find information", ephemeral: true }];
    }

    const docsHost = channel === "beta" ? "rc" : "www";
    return [
      {
        type: "reply" as const,
        embeds: [
          {
            title: data.title,
            description: data.description,
            thumbnail: `https://brands.home-assistant.io/${domain}/dark_logo.png`,
            fields: [
              {
                name: "Documentation",
                value: `[View the documentation](https://${docsHost}.home-assistant.io/integrations/${domain}/)`,
                inline: true,
              },
              {
                name: "Quality scale",
                value: `[${
                  QUALITY_SCALE_LABEL[data.quality_scale ?? ""] ?? QUALITY_SCALE_LABEL.no_score
                }](https://www.home-assistant.io/docs/quality_scale/)`,
                inline: true,
              },
              {
                name: "IoT Class",
                value: `[${
                  data.iot_class || "Unknown"
                }](https://developers.home-assistant.io/docs/creating_integration_manifest#iot-class)`,
                inline: true,
              },
              {
                name: "Integration type",
                value: `[${
                  data.integration_type || "Unknown"
                }](https://developers.home-assistant.io/docs/creating_integration_manifest#integration-type)`,
                inline: true,
              },
              {
                name: "Source",
                value: `[View the source on GitHub](https://github.com/home-assistant/core/tree/dev/homeassistant/components/${domain})`,
                inline: true,
              },
              {
                name: "Issues",
                value: `[View known issues](https://github.com/home-assistant/core/issues?q=is%3Aissue+is%3Aopen+label%3A%22integration%3A+${domain}%22)`,
                inline: true,
              },
            ],
          },
        ],
      },
    ];
  },

  async autocomplete(context) {
    const data = await loadIntegrations(releaseChannel(context.channel.id));
    const choices = Object.entries(data).map(([domain, entry]) => ({
      name: entry.title,
      value: domain,
    }));
    return filterChoices(choices, context.event.focused.value);
  },
};
