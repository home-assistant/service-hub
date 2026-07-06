import { fetchWithTimeout } from "../../util/fetch.js";

export interface PredefinedMessage {
  content: string;
  description?: string;
  title?: string;
  image?: string;
  fields?: { name: string; value: string }[];
}

type MessageData = Record<string, PredefinedMessage>;

// The YAML data files stay in the legacy repo until it's fully retired.
const DATA_BASE =
  "https://raw.githubusercontent.com/home-assistant/service-hub/main/data/discord/messages";

/** Guild snowflake → guild-specific message file merged over common.yaml. */
export const GUILD_MESSAGE_FILES: Record<string, string> = {
  "330944238910963714": "homeassistant.yaml",
  "429907082951524364": "esphome.yaml",
};

const cache = new Map<string, MessageData>();

async function fetchYaml(file: string): Promise<MessageData> {
  const response = await fetchWithTimeout(`${DATA_BASE}/${file}`);
  if (!response.ok) throw new Error(`Failed to fetch ${file}: ${response.status}`);
  return (Bun.YAML.parse(await response.text()) ?? {}) as MessageData;
}

export async function loadMessages(guildId: string, force = false): Promise<MessageData> {
  const cached = cache.get(guildId);
  if (cached && !force) return cached;
  const guildFile = GUILD_MESSAGE_FILES[guildId];
  const data: MessageData = {
    ...(await fetchYaml("common.yaml")),
    ...(guildFile ? await fetchYaml(guildFile) : {}),
  };
  cache.set(guildId, data);
  return data;
}

export async function getMessage(
  guildId: string,
  key: string,
): Promise<PredefinedMessage | undefined> {
  return (await loadMessages(guildId))[key];
}

export function resetMessageCache(): void {
  cache.clear();
}
