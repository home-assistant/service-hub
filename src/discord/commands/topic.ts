import type { SlashCommand } from "../engine/types.js";

export const topic: SlashCommand = {
  name: "topic",
  description: "Returns the topic of the current channel",
  options: [
    {
      name: "user",
      description: "Tag the user you want the message to be posted for",
      kind: "mentionable",
    },
  ],

  async handle(context) {
    const channelTopic = context.channel.topic;
    if (!channelTopic) {
      return [
        { type: "reply" as const, content: "This channel does not have a topic", ephemeral: true },
      ];
    }
    return [
      {
        type: "reply" as const,
        embeds: [
          {
            title: "The topic of this channel is:",
            description: [context.userMention, channelTopic].filter(Boolean).join(" "),
          },
        ],
      },
    ];
  },
};
