import type { SlashCommand } from "../engine/types.js";

const MAX_PREVIEW_LENGTH = 64;

/** One-line, link-safe preview: no newlines, no <>, no URL schemes. */
function preview(content: string): string {
  const oneLine = content.replace(/\n/g, " ");
  return (
    oneLine.length < MAX_PREVIEW_LENGTH ? oneLine : `${oneLine.substring(0, MAX_PREVIEW_LENGTH)}...`
  )
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/https?:\/\//g, "");
}

export const pinned: SlashCommand = {
  name: "pinned",
  description: "Returns pinned messages",

  async handle(context) {
    const messages = await context.reader.pinnedMessages(context.channel.id);
    if (messages.length === 0) {
      return [
        { type: "reply" as const, content: "No pinned messages in this channel", ephemeral: true },
      ];
    }
    return [
      {
        type: "reply" as const,
        embeds: [
          {
            title: "The pinned messages of this channel are:",
            description: messages
              .map(
                (message) =>
                  `- ["${preview(message.content) || "embeded content"}"](<${message.url}>)`,
              )
              .join("\n"),
          },
        ],
      },
    ];
  },
};
