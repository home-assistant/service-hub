import { DiscordGuild } from '../discord.const';
import { CommandsCommon } from './common';
import { CommandsEsphome } from './esphome';
import { CommandsHomeassistant } from './home-assistant';

export const DiscordCommands = {
  common: CommandsCommon,
  [DiscordGuild.ESPHOME]: CommandsEsphome,
  [DiscordGuild.HOME_ASSISTANT]: CommandsHomeassistant,
};
