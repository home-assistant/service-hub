import {
  ActionRowBuilder,
  type ApplicationCommandDataResolvable,
  AttachmentBuilder,
  ChannelType,
  Client,
  type Channel as DiscordChannel,
  Events,
  GatewayIntentBits,
  type Guild,
  type GuildMember,
  type Interaction,
  type Message,
  MessageFlags,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { log } from "../../log.js";
import type { ChannelPort, EffectPorts, ResponderPort } from "./apply.js";
import { applyDiscordEffects } from "./apply.js";
import type { ChannelReader, PinnedMessage } from "./context.js";
import { dispatchDiscordEvent, type GuildRegistry } from "./dispatch.js";
import type {
  AutocompleteEvent,
  ChannelInfo,
  CommandEvent,
  DiscordEvent,
  MessageCreatedEvent,
  ModalSubmitEvent,
  UserInfo,
} from "./event.js";
import { DiscordEventType } from "./event.js";
import { buildCommandRegistrations } from "./register.js";
import type { Embed, ModalSpec } from "./types.js";

// Interaction responses raced by a redeploy; nothing actionable.
const IGNORED_API_ERRORS = new Set([
  10062, // Unknown interaction
  40060, // Interaction has already been acknowledged
]);

function isIgnoredApiError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    IGNORED_API_ERRORS.has((err as { code: number }).code)
  );
}

// ── Normalization: discord.js objects → plain events ────────────────────────

function channelInfo(channel: DiscordChannel | null): ChannelInfo {
  return {
    id: channel?.id ?? "",
    name: channel && "name" in channel ? (channel.name ?? "") : "",
    kind: channel?.type === ChannelType.GuildText ? "guild_text" : "other",
    topic: channel && "topic" in channel ? channel.topic : null,
  };
}

function roleNames(guild: Guild | null, member: unknown): string[] {
  if (!member || typeof member !== "object" || !("roles" in member)) return [];
  const roles = (member as { roles: unknown }).roles;
  // Gateway payloads carry either a hydrated GuildMember or a raw member
  // whose roles are snowflakes; resolve the latter through the guild cache.
  if (Array.isArray(roles)) {
    return roles.flatMap((id) => {
      const name = guild?.roles.cache.get(id)?.name;
      return name ? [name] : [];
    });
  }
  const cache = (roles as GuildMember["roles"]).cache;
  return [...cache.values()].map((role) => role.name);
}

function userInfo(
  user: { id: string; username: string; bot?: boolean },
  guild: Guild | null,
  member: unknown,
): UserInfo {
  return {
    id: user.id,
    username: user.username,
    isBot: user.bot ?? false,
    roleNames: roleNames(guild, member),
  };
}

/** Exported for the capture script; returns undefined for unhandled kinds. */
export function normalizeInteraction(interaction: Interaction): DiscordEvent | undefined {
  if (!interaction.guildId) return undefined;
  const base = {
    guildId: interaction.guildId,
    channel: channelInfo(interaction.channel),
    user: userInfo(interaction.user, interaction.guild, interaction.member),
  };

  if (interaction.isChatInputCommand()) {
    const options: Record<string, string> = {};
    for (const option of interaction.options.data) {
      if (option.value !== undefined) options[option.name] = String(option.value);
    }
    return {
      ...base,
      type: DiscordEventType.COMMAND,
      command: interaction.commandName,
      options,
    } satisfies CommandEvent;
  }

  if (interaction.isAutocomplete()) {
    const focused = interaction.options.getFocused(true);
    return {
      ...base,
      type: DiscordEventType.AUTOCOMPLETE,
      command: interaction.commandName,
      focused: { option: focused.name, value: String(focused.value) },
    } satisfies AutocompleteEvent;
  }

  if (interaction.isModalSubmit()) {
    const fields: Record<string, string> = {};
    for (const field of interaction.fields.fields.values()) {
      // Only text inputs — the sole component kind our modals contain.
      if ("value" in field && typeof field.value === "string") {
        fields[field.customId] = field.value;
      }
    }
    return {
      ...base,
      type: DiscordEventType.MODAL_SUBMIT,
      customId: interaction.customId,
      fields,
    } satisfies ModalSubmitEvent;
  }

  return undefined;
}

/** Exported for the capture script. */
export function normalizeMessage(message: Message): MessageCreatedEvent | undefined {
  if (!message.guildId) return undefined;
  return {
    type: DiscordEventType.MESSAGE_CREATED,
    guildId: message.guildId,
    channel: channelInfo(message.channel),
    user: userInfo(message.author, message.guild, message.member),
    messageId: message.id,
    content: message.content,
  };
}

// ── Ports: plain effects → discord.js calls ─────────────────────────────────

function toApiEmbed(embed: Embed) {
  return {
    title: embed.title,
    description: embed.description,
    url: embed.url,
    fields: embed.fields,
    image: embed.image ? { url: embed.image } : undefined,
    thumbnail: embed.thumbnail ? { url: embed.thumbnail } : undefined,
  };
}

function toModal(modal: ModalSpec): ModalBuilder {
  return new ModalBuilder({
    customId: modal.customId,
    title: modal.title,
    components: modal.fields.map((field) =>
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder({
          customId: field.id,
          label: field.label,
          required: field.required,
          style: TextInputStyle.Short,
        }),
      ),
    ),
  });
}

type RepliableInteraction = Extract<Interaction, { reply: unknown }>;

function interactionResponder(interaction: Interaction): ResponderPort {
  return {
    async reply(options) {
      if (!interaction.isRepliable() || interaction.replied) return;
      try {
        await (interaction as RepliableInteraction).reply({
          content: options.content,
          embeds: options.embeds?.map(toApiEmbed),
          flags: options.ephemeral ? MessageFlags.Ephemeral : undefined,
        });
      } catch (err) {
        if (!isIgnoredApiError(err)) throw err;
      }
    },
    async showModal(modal) {
      if (!interaction.isChatInputCommand()) return;
      try {
        await interaction.showModal(toModal(modal));
      } catch (err) {
        if (!isIgnoredApiError(err)) throw err;
      }
    },
    async autocomplete(choices) {
      if (!interaction.isAutocomplete()) return;
      try {
        await interaction.respond(choices);
      } catch (err) {
        if (!isIgnoredApiError(err)) throw err;
      }
    },
  };
}

function channelPort(client: Client): ChannelPort {
  const textChannel = async (channelId: string) => {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !("send" in channel)) {
      throw new Error(`Channel ${channelId} is not a sendable text channel`);
    }
    return channel;
  };
  return {
    async send(channelId, message) {
      const channel = await textChannel(channelId);
      await channel.send({
        content: message.content,
        embeds: message.embeds?.map(toApiEmbed),
        files: message.files?.map(
          (file) => new AttachmentBuilder(Buffer.from(file.content, "utf-8"), { name: file.name }),
        ),
      });
    },
    async deleteMessage(channelId, messageId) {
      const channel = await textChannel(channelId);
      await channel.messages.delete(messageId);
    },
  };
}

function channelReader(client: Client): ChannelReader {
  return {
    async pinnedMessages(channelId): Promise<PinnedMessage[]> {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !("messages" in channel)) return [];
      const pinned = await channel.messages.fetchPinned();
      return [...pinned.values()].map((message) => ({
        content: message.content,
        url: message.url,
      }));
    },
  };
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export interface GatewayConfig {
  token: string;
  /** Tap on every normalized event, used by scripts/capture-discord.ts. */
  onEvent?: (event: DiscordEvent) => void;
}

/**
 * Connect to the Discord gateway, replace each manifest guild's slash
 * commands with the registry's, and pump normalized events through
 * dispatch → apply. Resolves once logged in; rejects on bad credentials.
 */
export async function startDiscordGateway(
  registry: GuildRegistry,
  config: GatewayConfig,
): Promise<Client> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
  const ports: EffectPorts = { channels: channelPort(client) };
  const reader = channelReader(client);

  const handle = async (event: DiscordEvent | undefined, responder?: ResponderPort) => {
    if (!event) return;
    config.onEvent?.(event);
    const effects = await dispatchDiscordEvent(registry, event, reader);
    await applyDiscordEffects(effects, { ...ports, responder });
  };

  client.on(Events.InteractionCreate, (interaction) => {
    handle(normalizeInteraction(interaction), interactionResponder(interaction)).catch((err) =>
      log.exception(err instanceof Error ? err : new Error(String(err))),
    );
  });

  client.on(Events.MessageCreate, (message) => {
    handle(normalizeMessage(message)).catch((err) =>
      log.exception(err instanceof Error ? err : new Error(String(err))),
    );
  });

  client.once(Events.ClientReady, async (ready) => {
    for (const [guildId, guildConfig] of Object.entries(registry.guilds)) {
      try {
        await ready.application.commands.set(
          buildCommandRegistrations(guildConfig.commands) as ApplicationCommandDataResolvable[],
          guildId,
        );
      } catch (err) {
        log.error("discord: command registration failed", { guildId, error: String(err) });
      }
    }
    log.info("discord: gateway ready", {
      user: ready.user.tag,
      guilds: Object.keys(registry.guilds).join(", "),
    });
  });

  await client.login(config.token);
  return client;
}
