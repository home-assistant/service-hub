import type { Listener, SlashCommand } from "../engine/types.js";

/**
 * The authored description of what the bot does in one Discord guild: which
 * slash commands are registered there and which gateway listeners run. The
 * counterpart of the GitHub side's RepoManifest — read `commands` and
 * `listeners` top to bottom to know exactly what the bot does in the guild.
 */
export interface GuildManifest {
  /** Guild snowflake. */
  id: string;
  /** Human-readable name, for docs and logs only. */
  name: string;
  /** Message file backing /message, under src/discord/messages/. */
  messageFile: string;
  commands: SlashCommand[];
  listeners: Listener[];
}
