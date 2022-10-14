import { DiscordGuild } from '../discord.const';
import { ListenersCommon } from './common';
import { ListenersEsphome } from './esphome';
import { ListenersHomeassistant } from './home-assistant';

export const DiscordListeners = {
  common: ListenersCommon,
  [DiscordGuild.ESPHOME]: ListenersEsphome,
  [DiscordGuild.HOME_ASSISTANT]: ListenersHomeassistant,
};
