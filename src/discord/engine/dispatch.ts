import { log } from "../../log.js";
import type {
  AutocompleteContext,
  ChannelReader,
  ListenerContext,
  ModalContext,
} from "./context.js";
import { CommandContext, DiscordContext } from "./context.js";
import type { DiscordEvent } from "./event.js";
import { DiscordEventType } from "./event.js";
import type { DiscordEffect, Listener, SlashCommand } from "./types.js";

export interface GuildConfig {
  commands: SlashCommand[];
  listeners: Listener[];
}

/** Guild snowflake → what runs there. Assembled from guild manifests. */
export interface GuildRegistry {
  guilds: Record<string, GuildConfig>;
}

export function findGuildCommand(
  registry: GuildRegistry,
  guildId: string,
  name: string,
): SlashCommand | undefined {
  return registry.guilds[guildId]?.commands.find((command) => command.name === name);
}

function errorReply(err: unknown): DiscordEffect {
  return {
    type: "reply",
    content: err instanceof Error ? err.message : "Unknown error",
    ephemeral: true,
  };
}

function reportException(err: unknown): void {
  log.exception(err instanceof Error ? err : new Error(String(err)));
}

function isAnswered(effects: DiscordEffect[]): boolean {
  return effects.some((e) => e.type === "reply" || e.type === "showModal");
}

async function dispatchCommand(
  registry: GuildRegistry,
  context: CommandContext,
): Promise<DiscordEffect[]> {
  const { command: name, guildId } = context.event;
  const command = findGuildCommand(registry, guildId, name);
  if (!command) {
    log.warn("discord: unknown command", { guildId, command: name });
    return [{ type: "reply", content: "Unknown command", ephemeral: true }];
  }

  log.info("discord: command", {
    guildId,
    command: name,
    channel: context.channel.name,
    user: context.user.username,
  });

  try {
    const effects = (await command.handle(context)) ?? [];
    // Every interaction must be answered within Discord's deadline; a
    // handler that stayed silent still gets an acknowledgement.
    return isAnswered(effects)
      ? effects
      : [...effects, { type: "reply", content: "Command completed", ephemeral: true }];
  } catch (err) {
    reportException(err);
    return [errorReply(err)];
  }
}

async function dispatchAutocomplete(
  registry: GuildRegistry,
  context: AutocompleteContext,
): Promise<DiscordEffect[]> {
  const command = findGuildCommand(registry, context.guildId, context.event.command);
  if (!command?.autocomplete) return [];
  try {
    return [{ type: "autocomplete", choices: await command.autocomplete(context) }];
  } catch (err) {
    reportException(err);
    // Still answer the interaction — an empty list renders as "no results".
    return [{ type: "autocomplete", choices: [] }];
  }
}

async function dispatchModal(
  registry: GuildRegistry,
  context: ModalContext,
): Promise<DiscordEffect[]> {
  const owner = context.event.customId.split(":", 1)[0];
  const command = findGuildCommand(registry, context.guildId, owner);
  if (!command?.handleModal) {
    log.warn("discord: unrouted modal submit", { customId: context.event.customId });
    return [];
  }
  try {
    return (await command.handleModal(context)) ?? [];
  } catch (err) {
    reportException(err);
    return [errorReply(err)];
  }
}

async function dispatchMessage(
  registry: GuildRegistry,
  context: ListenerContext,
): Promise<DiscordEffect[]> {
  const listeners = registry.guilds[context.guildId]?.listeners ?? [];
  const effects: DiscordEffect[] = [];
  for (const listener of listeners) {
    const handler = listener.events.message_created;
    if (!handler) continue;
    try {
      effects.push(...((await handler(context)) ?? []));
    } catch (err) {
      log.error("discord: listener failed", { listener: listener.name, error: String(err) });
    }
  }
  return effects;
}

/**
 * Route a normalized event to its handlers and return the effects to apply.
 * Pure with respect to Discord: application happens in apply.ts, so tests
 * and fixtures snapshot the return value of this function.
 */
export async function dispatchDiscordEvent(
  registry: GuildRegistry,
  event: DiscordEvent,
  reader: ChannelReader,
): Promise<DiscordEffect[]> {
  // The bot's own sends echo back as message_created — never react to them.
  if (event.user.isBot) return [];

  switch (event.type) {
    case DiscordEventType.COMMAND:
      return dispatchCommand(registry, new CommandContext(event, reader));
    case DiscordEventType.AUTOCOMPLETE:
      return dispatchAutocomplete(registry, new DiscordContext(event, reader));
    case DiscordEventType.MODAL_SUBMIT:
      return dispatchModal(registry, new DiscordContext(event, reader));
    case DiscordEventType.MESSAGE_CREATED:
      return dispatchMessage(registry, new DiscordContext(event, reader));
  }
}
