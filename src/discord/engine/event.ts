export enum DiscordEventType {
  COMMAND = "command",
  AUTOCOMPLETE = "autocomplete",
  MODAL_SUBMIT = "modal_submit",
  MESSAGE_CREATED = "message_created",
}

/**
 * Where the event happened. `topic` is carried on the event because gateway
 * objects already have it — no extra fetch; anything that would cost a
 * request (pinned messages) goes through ChannelReader instead.
 */
export interface ChannelInfo {
  id: string;
  name: string;
  /** Only `guild_text` matters to handlers today; everything else is "other". */
  kind: "guild_text" | "other";
  topic: string | null;
}

export interface UserInfo {
  id: string;
  username: string;
  isBot: boolean;
  /** Guild role names; empty when the member isn't resolved (DMs, some interactions). */
  roleNames: string[];
}

interface BaseEvent {
  guildId: string;
  channel: ChannelInfo;
  user: UserInfo;
}

export interface CommandEvent extends BaseEvent {
  type: DiscordEventType.COMMAND;
  command: string;
  /** Option name → raw value. Mentionable options carry the target's snowflake. */
  options: Record<string, string>;
}

export interface AutocompleteEvent extends BaseEvent {
  type: DiscordEventType.AUTOCOMPLETE;
  command: string;
  focused: { option: string; value: string };
}

export interface ModalSubmitEvent extends BaseEvent {
  type: DiscordEventType.MODAL_SUBMIT;
  /** `<command>[:<detail>]` — the command that opened the modal owns the submit. */
  customId: string;
  fields: Record<string, string>;
}

export interface MessageCreatedEvent extends BaseEvent {
  type: DiscordEventType.MESSAGE_CREATED;
  messageId: string;
  content: string;
}

/**
 * Normalized inbound Discord event: plain serializable data, no discord.js
 * classes. The gateway adapter is the only producer in production; test
 * fixtures are captured/authored instances of these shapes.
 */
export type DiscordEvent =
  | CommandEvent
  | AutocompleteEvent
  | ModalSubmitEvent
  | MessageCreatedEvent;
