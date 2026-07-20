import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export interface PredefinedMessage {
  content: string;
  description?: string;
  title?: string;
  image?: string;
  fields?: { name: string; value: string }[];
}

type MessageData = Record<string, PredefinedMessage>;

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

function parseFile(file: string): MessageData {
  return (parseYaml(readFile(file)) ?? {}) as MessageData;
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
