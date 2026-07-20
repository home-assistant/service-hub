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

const cache = new Map<string, MessageData>();

/** Parse and schema-validate one message YAML document. */
export function parseMessageFile(raw: string): MessageData {
  return MessageFileSchema.parse(parseYaml(raw) ?? {});
}

function parseFile(file: string): MessageData {
  return parseMessageFile(readFile(file));
}

/** Load common.yaml merged with the guild's message file (if any), cached per file. */
export function loadMessages(guildFile: string | undefined, force = false): MessageData {
  const cacheKey = guildFile ?? "";
  const cached = cache.get(cacheKey);
  if (cached && !force) return cached;
  const data: MessageData = {
    ...parseFile("common.yaml"),
    ...(guildFile ? parseFile(guildFile) : {}),
  };
  cache.set(cacheKey, data);
  return data;
}

export function getMessage(
  guildFile: string | undefined,
  key: string,
): PredefinedMessage | undefined {
  return loadMessages(guildFile)[key];
}

export function resetMessageCache(): void {
  cache.clear();
}

/** Test seam: override how message files are read. Pass null to restore disk reads. */
export function setMessageFileReader(reader: MessageFileReader | null): void {
  readFile = reader ?? readFromDisk;
  cache.clear();
}
