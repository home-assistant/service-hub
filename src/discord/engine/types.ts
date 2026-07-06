import type {
  AutocompleteContext,
  CommandContext,
  ListenerContext,
  ModalContext,
} from "./context.js";

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

/** Plain embed spec; the applier maps it onto the Discord API shape. */
export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  fields?: EmbedField[];
  image?: string;
  thumbnail?: string;
}

/** UTF-8 text attachment (the only kind the bot sends). */
export interface FileAttachment {
  name: string;
  content: string;
}

export interface ModalSpec {
  /** `<command>[:<detail>]` so the submit routes back to the opening command. */
  customId: string;
  title: string;
  fields: { id: string; label: string; required: boolean }[];
}

/**
 * Structured side-effects returned by command/listener handlers. The
 * dispatcher applies them through ports owned by the gateway adapter —
 * handlers never touch discord.js. `reply`, `showModal`, and `autocomplete`
 * answer the triggering interaction; the rest are addressed explicitly.
 */
export type DiscordEffect =
  | { type: "reply"; content?: string; embeds?: Embed[]; ephemeral?: boolean }
  | { type: "showModal"; modal: ModalSpec }
  | { type: "autocomplete"; choices: AutocompleteChoice[] }
  | {
      type: "sendMessage";
      channelId: string;
      content?: string;
      embeds?: Embed[];
      files?: FileAttachment[];
    }
  | { type: "deleteMessage"; channelId: string; messageId: string };

export interface AutocompleteChoice {
  name: string;
  value: string;
}

export interface CommandOptionSpec {
  name: string;
  description: string;
  required?: boolean;
  autocomplete?: boolean;
  /** `mentionable` renders a user/role picker; the event carries the snowflake. */
  kind?: "string" | "mentionable";
}

/**
 * A slash command. Like GitHub rules, handlers return effects instead of
 * mutating Discord directly; `options` doubles as the registration payload
 * (see register.ts). A command that opens a modal handles the submit too,
 * matched on the modal customId's `<command>` prefix.
 */
export interface SlashCommand {
  name: string;
  description: string;
  options?: CommandOptionSpec[];
  handle(context: CommandContext): Promise<DiscordEffect[] | undefined>;
  autocomplete?(context: AutocompleteContext): Promise<AutocompleteChoice[]>;
  handleModal?(context: ModalContext): Promise<DiscordEffect[] | undefined>;
}

/**
 * A gateway-event handler (non-interaction). Bot-authored messages are
 * dropped by the dispatcher, so listeners never see the bot's own sends.
 */
export interface Listener {
  name: string;
  description: string;
  events: {
    message_created?: (context: ListenerContext) => Promise<DiscordEffect[] | undefined>;
  };
}
