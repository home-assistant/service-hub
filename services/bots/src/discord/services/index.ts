import { DiscordGuild } from '../discord.const';
import { ServicesCommon } from './common';
import { ServicesEsphome } from './esphome';
import { ServicesHomeassistant } from './home-assistant';

export const DiscordServices = {
  common: ServicesCommon,
  [DiscordGuild.ESPHOME]: ServicesEsphome,
  [DiscordGuild.HOME_ASSISTANT]: ServicesHomeassistant,
};
