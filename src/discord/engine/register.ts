import type { CommandOptionSpec, SlashCommand } from "./types.js";

// ApplicationCommandOptionType values (Discord API): kept as literals so this
// module stays plain data — registration payloads are snapshot-testable
// without discord.js.
const OPTION_TYPE = { string: 3, mentionable: 9 } as const;

// PermissionFlagsBits.UseApplicationCommands, so roles that revoke the
// permission (mute patterns) can't use the bot's commands.
const DEFAULT_MEMBER_PERMISSIONS = (1n << 31n).toString();

export interface CommandRegistration {
  name: string;
  description: string;
  default_member_permissions: string;
  options?: {
    type: number;
    name: string;
    description: string;
    required: boolean;
    autocomplete: boolean;
  }[];
}

function registrationOption(option: CommandOptionSpec) {
  return {
    type: OPTION_TYPE[option.kind ?? "string"],
    name: option.name,
    description: option.description,
    required: option.required ?? false,
    autocomplete: option.autocomplete ?? false,
  };
}

/**
 * The guild-command payload for `PUT /applications/{id}/guilds/{guild}/commands`
 * (a full replace, so stale commands from earlier deploys drop off).
 */
export function buildCommandRegistrations(commands: SlashCommand[]): CommandRegistration[] {
  return commands.map((command) => ({
    name: command.name,
    description: command.description,
    default_member_permissions: DEFAULT_MEMBER_PERMISSIONS,
    ...(command.options?.length ? { options: command.options.map(registrationOption) } : {}),
  }));
}
