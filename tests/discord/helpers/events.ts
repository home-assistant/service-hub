import type { ChannelReader, PinnedMessage } from "../../../src/discord/engine/context.js";
import type {
  AutocompleteEvent,
  ChannelInfo,
  CommandEvent,
  MessageCreatedEvent,
  ModalSubmitEvent,
  UserInfo,
} from "../../../src/discord/engine/event.js";
import { DiscordEventType } from "../../../src/discord/engine/event.js";

export const HOME_ASSISTANT_GUILD = "330944238910963714";
export const ESPHOME_GUILD = "429907082951524364";

export function channel(overrides: Partial<ChannelInfo> = {}): ChannelInfo {
  return {
    id: "1000000000000000001",
    name: "general",
    kind: "guild_text",
    topic: null,
    ...overrides,
  };
}

export function user(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: "2000000000000000001",
    username: "contributor",
    isBot: false,
    roleNames: [],
    ...overrides,
  };
}

type EventOverrides<E> = Partial<Omit<E, "type">>;

export function commandEvent(
  command: string,
  options: Record<string, string> = {},
  overrides: EventOverrides<CommandEvent> = {},
): CommandEvent {
  return {
    type: DiscordEventType.COMMAND,
    guildId: HOME_ASSISTANT_GUILD,
    channel: channel(),
    user: user(),
    command,
    options,
    ...overrides,
  };
}

export function autocompleteEvent(
  command: string,
  focused: { option: string; value: string },
  overrides: EventOverrides<AutocompleteEvent> = {},
): AutocompleteEvent {
  return {
    type: DiscordEventType.AUTOCOMPLETE,
    guildId: HOME_ASSISTANT_GUILD,
    channel: channel(),
    user: user(),
    command,
    focused,
    ...overrides,
  };
}

export function modalEvent(
  customId: string,
  fields: Record<string, string> = {},
  overrides: EventOverrides<ModalSubmitEvent> = {},
): ModalSubmitEvent {
  return {
    type: DiscordEventType.MODAL_SUBMIT,
    guildId: HOME_ASSISTANT_GUILD,
    channel: channel(),
    user: user(),
    customId,
    fields,
    ...overrides,
  };
}

export function messageEvent(
  content: string,
  overrides: EventOverrides<MessageCreatedEvent> = {},
): MessageCreatedEvent {
  return {
    type: DiscordEventType.MESSAGE_CREATED,
    guildId: HOME_ASSISTANT_GUILD,
    channel: channel(),
    user: user(),
    messageId: "3000000000000000001",
    content,
    ...overrides,
  };
}

export function stubReader(pinned: PinnedMessage[] = []): ChannelReader {
  return { pinnedMessages: async () => pinned };
}
