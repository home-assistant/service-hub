import type { Listener } from "../engine/types.js";

export const MAX_LINE_COUNT = 17;

const KNOWN_FILETYPES = new Set([
  "diff",
  "javascript",
  "js",
  "json",
  "py",
  "python",
  "sh",
  "ts",
  "txt",
  "typescript",
  "yaml",
  "yml",
]);

const EXEMPT_ROLES = new Set(["Admin", "Mod"]);

const CODE_BLOCK = /^```([a-z|A-Z]*)\n(.*)\n```[\n]*$/s;

function isValidJson(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

function isValidYaml(content: string): boolean {
  try {
    Bun.YAML.parse(content);
    return true;
  } catch {
    return false;
  }
}

/** File body and type for the repost; sniffs the language of bare code blocks. */
function extractAttachment(content: string): { content: string; fileType: string } {
  const match = CODE_BLOCK.exec(content);
  if (!match) return { content, fileType: "txt" };
  let [, language, body] = match;
  if (!language && isValidJson(body)) language = "json";
  else if (!language && isValidYaml(body)) language = "yaml";
  const fileType = language.toLowerCase();
  return { content: body, fileType: KNOWN_FILETYPES.has(fileType) ? fileType : "txt" };
}

export const lineCountEnforcer: Listener = {
  name: "line-count-enforcer",
  description: `Reposts messages longer than ${MAX_LINE_COUNT} lines as file attachments`,

  events: {
    message_created: async (context) => {
      const { channel, content, messageId, user } = context.event;
      if (channel.kind !== "guild_text") return;
      if (user.roleNames.some((role) => EXEMPT_ROLES.has(role))) return;
      if (content.split("\n").length <= MAX_LINE_COUNT) return;

      const attachment = extractAttachment(content);
      const fileName = `${[channel.name, user.username, messageId]
        .join("_")
        .toLowerCase()
        .replace(/-/g, "_")}.${attachment.fileType}`;

      return [
        {
          type: "sendMessage",
          channelId: channel.id,
          content: `<@${user.id}> I converted your message into a file since it's above 15 lines :+1:`,
          files: [{ name: fileName, content: attachment.content }],
        },
        { type: "deleteMessage", channelId: channel.id, messageId },
      ];
    },
  },
};
