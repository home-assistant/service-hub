import { getIntegration } from "../data/integrations.js";
import { getMyRedirect, loadMyRedirects } from "../data/my-redirects.js";
import { filterChoices } from "../engine/autocomplete.js";
import type { DiscordEffect, SlashCommand } from "../engine/types.js";

const MY_BASE = "https://my.home-assistant.io/redirect";

export const my: SlashCommand = {
  name: "my",
  description: "Returns a my link",
  options: [
    {
      name: "redirect",
      description: "What is the name of the redirect?",
      required: true,
      autocomplete: true,
    },
  ],

  async handle(context) {
    const key = context.option("redirect") ?? "";

    if (key === "reload") {
      await loadMyRedirects(true);
      return [{ type: "reply" as const, content: "My redirect list reloaded", ephemeral: true }];
    }

    const redirect = await getMyRedirect(key);
    if (!redirect) {
      return [{ type: "reply" as const, content: "Could not find information", ephemeral: true }];
    }

    // Parameterized redirects need user input first — collect it via a modal
    // whose submit routes back here through the `my:` customId prefix.
    if (redirect.params) {
      return [
        {
          type: "showModal" as const,
          modal: {
            customId: `my:${redirect.redirect}`,
            title: "Additional data",
            fields: Object.entries(redirect.params).map(([key, keyType]) => ({
              id: key,
              label: key,
              required: !keyType.includes("?"),
            })),
          },
        },
      ];
    }

    return [
      {
        type: "reply" as const,
        embeds: [
          {
            title: redirect.name,
            description: `Open your Home Assistant instance and ${redirect.description}`,
            url: `${MY_BASE}/${redirect.redirect}/`,
          },
        ],
      },
    ];
  },

  async autocomplete(context) {
    const redirects = await loadMyRedirects();
    const choices = redirects
      .filter((redirect) => !redirect.deprecated)
      .map((redirect) => ({ name: redirect.name, value: redirect.redirect }));
    return filterChoices(choices, context.event.focused.value);
  },

  async handleModal(context): Promise<DiscordEffect[]> {
    const key = context.event.customId.slice("my:".length);
    const redirect = await getMyRedirect(key);
    if (!redirect) {
      return [{ type: "reply" as const, content: "Could not find information", ephemeral: true }];
    }

    const url = new URL(`${MY_BASE}/${redirect.redirect}/`);
    for (const [field, value] of Object.entries(context.event.fields)) {
      url.searchParams.set(field, value);
    }

    const domain = context.event.fields.domain;
    const title =
      domain && redirect.redirect === "config_flow_start"
        ? `Add integration: ${(await getIntegration(domain))?.title || domain}`
        : redirect.name;

    return [
      {
        type: "reply" as const,
        embeds: [{ title, description: redirect.description, url: url.toString() }],
      },
    ];
  },
};
