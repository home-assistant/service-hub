import { getComponent, loadComponents } from "../data/esphome-components.js";
import { filterChoices } from "../engine/autocomplete.js";
import type { SlashCommand } from "../engine/types.js";

export const component: SlashCommand = {
  name: "component",
  description: "Returns information about an component",
  options: [
    {
      name: "component",
      description: "What is the name of the component?",
      required: true,
      autocomplete: true,
    },
  ],

  async handle(context) {
    const name = context.option("component") ?? "";

    if (name === "reload") {
      await loadComponents(true);
      return [{ type: "reply" as const, content: "Component list reloaded", ephemeral: true }];
    }

    const data = await getComponent(name);
    if (!data) {
      return [{ type: "reply" as const, content: "Could not find information", ephemeral: true }];
    }

    return [
      {
        type: "reply" as const,
        embeds: [
          {
            title: data.title,
            image: data.image,
            fields: [
              {
                name: "Documentation",
                value: `[View the documentation](${data.url})`,
                inline: true,
              },
              {
                name: "Source",
                value: `[View the source on GitHub](https://github.com/esphome/esphome/tree/dev/esphome/${data.path})`,
                inline: true,
              },
            ],
          },
        ],
      },
    ];
  },

  async autocomplete(context) {
    const data = await loadComponents();
    const choices = Object.entries(data).map(([name, entry]) => ({
      name: entry.title,
      value: name,
    }));
    return filterChoices(choices, context.event.focused.value);
  },
};
