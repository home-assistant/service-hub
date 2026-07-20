import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const MessageSchema = z
  .object({
    content: z.string(),
    description: z.string().optional(),
    title: z.string().optional(),
    image: z.url().optional(),
    fields: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  })
  .strict();

/** A predefined message the bot can post via the /message command. */
export type PredefinedMessage = z.infer<typeof MessageSchema>;

/** A message file is a map of key → message. */
const MessageFileSchema = z.record(z.string(), MessageSchema);

type MessageData = z.infer<typeof MessageFileSchema>;

/** Reads a message YAML file's raw text. Overridable in tests. */
type MessageFileReader = (file: string) => string;

const readFromDisk: MessageFileReader = (file) =>
  readFileSync(new URL(`../messages/${file}`, import.meta.url), "utf-8");

let readFile: MessageFileReader = readFromDisk;

/** Guild snowflake → guild-specific message file merged over common.yaml. */
export const GUILD_MESSAGE_FILES: Record<string, string> = {
  "330944238910963714": "homeassistant.yaml",
  "429907082951524364": "esphome.yaml",
};

const cache = new Map<string, MessageData>();

/** Parse and schema-validate one message YAML document. */
export function parseMessageFile(raw: string): MessageData {
  return MessageFileSchema.parse(parseYaml(raw) ?? {});
}

function parseFile(file: string): MessageData {
  return parseMessageFile(readFile(file));
}

export function loadMessages(guildId: string, force = false): MessageData {
  const cached = cache.get(guildId);
  if (cached && !force) return cached;
  const guildFile = GUILD_MESSAGE_FILES[guildId];
  const data: MessageData = {
    ...parseFile("common.yaml"),
    ...(guildFile ? parseFile(guildFile) : {}),
  };
  cache.set(guildId, data);
  return data;
}

export function getMessage(guildId: string, key: string): PredefinedMessage | undefined {
  return loadMessages(guildId)[key];
}

export function resetMessageCache(): void {
  cache.clear();
}

/** Test seam: override how message files are read. Pass null to restore disk reads. */
export function setMessageFileReader(reader: MessageFileReader | null): void {
  readFile = reader ?? readFromDisk;
  cache.clear();
}
