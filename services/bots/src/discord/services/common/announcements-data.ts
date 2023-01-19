import fetch from 'node-fetch';
import yaml from 'js-yaml';

import { Injectable } from '@nestjs/common';
import { DiscordGuild } from '../../discord.const';

interface Messages {
  content: string;
}

interface AnnouncementsData {
  channel: string;
  messages: Messages[];
}

const GUILD_MESSAGES = {
  [DiscordGuild.ESPHOME]:
    'https://raw.githubusercontent.com/home-assistant/service-hub/main/data/discord/announcements/esphome.yaml',
  [DiscordGuild.HOME_ASSISTANT]:
    'https://raw.githubusercontent.com/home-assistant/service-hub/main/data/discord/announcements/homeassistant.yaml',
};

@Injectable()
export class ServiceCommonAnnouncementsData {
  public data: AnnouncementsData[];

  public async ensureData(guildId: string, force?: boolean): Promise<void> {
    if (force || !this.data) {
      this.data =
        guildId in GUILD_MESSAGES
          ? (yaml.load(await (await fetch(GUILD_MESSAGES[guildId])).text(), {
              json: true,
            }) as AnnouncementsData[])
          : [];
    }
  }
}
