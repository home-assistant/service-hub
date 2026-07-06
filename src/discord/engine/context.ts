import type {
  AutocompleteEvent,
  ChannelInfo,
  CommandEvent,
  DiscordEvent,
  MessageCreatedEvent,
  ModalSubmitEvent,
  UserInfo,
} from "./event.js";

export interface PinnedMessage {
  content: string;
  url: string;
}

/**
 * Reads that cost a request. Implemented over discord.js in the gateway
 * adapter; stubbed in tests. Kept minimal — cheap facts travel on the event.
 */
export interface ChannelReader {
  pinnedMessages(channelId: string): Promise<PinnedMessage[]>;
}

/**
 * What a handler receives: the normalized event plus request-costing reads.
 * Mirrors the GitHub engine's RuleContext, minus entity models — chat has no
 * lazily-hydrated state worth modeling yet.
 */
export class DiscordContext<E extends DiscordEvent = DiscordEvent> {
  readonly event: E;
  readonly reader: ChannelReader;

  constructor(event: E, reader: ChannelReader) {
    this.event = event;
    this.reader = reader;
  }

  get guildId(): string {
    return this.event.guildId;
  }

  get channel(): ChannelInfo {
    return this.event.channel;
  }

  get user(): UserInfo {
    return this.event.user;
  }
}

export class CommandContext extends DiscordContext<CommandEvent> {
  /** Raw option value, or undefined when the invoker omitted it. */
  option(name: string): string | undefined {
    return this.event.options[name];
  }

  /** The optional `user` mentionable option, rendered as a mention. */
  get userMention(): string | undefined {
    const id = this.option("user");
    return id ? `<@${id}>` : undefined;
  }
}

export type AutocompleteContext = DiscordContext<AutocompleteEvent>;
export type ModalContext = DiscordContext<ModalSubmitEvent>;
export type ListenerContext = DiscordContext<MessageCreatedEvent>;
