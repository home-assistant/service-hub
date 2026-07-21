import { getMessage, loadMessages } from "../data/messages.js";
import { filterChoices } from "../engine/autocomplete.js";
import type { SlashCommand } from "../engine/types.js";

export const message: SlashCommand = {
  name: "message",
  description: "Returns a predefined message",
  options: [
    {
      name: "message",
      description: "What message do you want to post?",
      required: true,
      autocomplete: true,
    },
    {
      name: "user",
      description: "Tag the user you want the message to be posted for",
      kind: "mentionable",
    },
  ],

  async handle(context) {
    const key = context.option("message") ?? "";

    if (key === "reload") {
      await loadMessages(context.guildMessageFile, true);
      return [{ type: "reply" as const, content: "Message list reloaded", ephemeral: true }];
    }

    const entry = await getMessage(context.guildMessageFile, key);
    if (!entry) {
      return [{ type: "reply" as const, content: "Could not find information", ephemeral: true }];
    }

    return [
      {
        type: "reply" as const,
        embeds: [
          {
            title: entry.title,
            description: [context.userMention, entry.content].filter(Boolean).join(" "),
            image: entry.image,
            fields: entry.fields?.length
              ? entry.fields.map((field) => ({ ...field, inline: true }))
              : undefined,
          },
        ],
      },
    ];
  },

  async autocomplete(context) {
    const data = await loadMessages(context.guildMessageFile);
    const choices = Object.entries(data)
      .filter(([, entry]) => entry.description || entry.title)
      .map(([key, entry]) => ({ name: entry.description || entry.title || key, value: key }));
    return filterChoices(choices, context.event.focused.value);
  },
};
