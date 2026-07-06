import type { GuildRegistry } from "../engine/dispatch.js";
import { esphomeGuild } from "./esphome.js";
import { homeAssistantGuild } from "./home-assistant.js";
import type { GuildManifest } from "./types.js";

/** Every guild the bot serves. Add a guild by authoring a manifest and listing it here. */
const MANIFESTS: GuildManifest[] = [homeAssistantGuild, esphomeGuild];

/**
 * Boot-time guardrails, mirroring the GitHub manifests: a duplicate command
 * name would silently shadow the earlier one in dispatch and be rejected by
 * Discord's registration endpoint — fail loudly at module load instead.
 */
function validate(manifest: GuildManifest): void {
  const commandNames = new Set<string>();
  for (const command of manifest.commands) {
    if (commandNames.has(command.name)) {
      throw new Error(`[${manifest.name}] duplicate command name "${command.name}"`);
    }
    commandNames.add(command.name);
  }
  const listenerNames = new Set<string>();
  for (const listener of manifest.listeners) {
    if (listenerNames.has(listener.name)) {
      throw new Error(`[${manifest.name}] duplicate listener name "${listener.name}"`);
    }
    listenerNames.add(listener.name);
  }
}

function build(): GuildRegistry {
  const guilds: GuildRegistry["guilds"] = {};
  for (const manifest of MANIFESTS) {
    validate(manifest);
    if (guilds[manifest.id]) {
      throw new Error(`Guild "${manifest.id}" is declared by more than one manifest`);
    }
    guilds[manifest.id] = { commands: manifest.commands, listeners: manifest.listeners };
  }
  return { guilds };
}

/** The Discord dispatcher's registry, assembled from every {@link GuildManifest}. */
export const discordRegistry: GuildRegistry = build();
