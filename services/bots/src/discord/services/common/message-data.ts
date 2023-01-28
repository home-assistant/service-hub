import fetch from 'node-fetch';
import yaml from 'js-yaml';

import { Injectable } from '@nestjs/common';
import { DiscordGuild } from '../../discord.const';

interface Message {
  content: string;
  description?: string;
  image?: string;
  title?: string;
  fields?: { name: string; value: string }[];
}

interface MessageData {
  [key: string]: Message;
}

const GUILD_MESSAGES = {
  [DiscordGuild.ESPHOME]:
    'https://raw.githubusercontent.com/home-assistant/service-hub/main/data/discord/messages/esphome.yaml',
  [DiscordGuild.HOME_ASSISTANT]:
    'https://raw.githubusercontent.com/home-assistant/service-hub/main/data/discord/messages/homeassistant.yaml',
};

@Injectable()
export class ServiceCommonMessageData {
  public data: MessageData;

  public async getMessage(guildId: string, messageKey: string): Promise<Message | undefined> {
    await this.ensureData(guildId);
    return this.data?.[messageKey];
  }

  public async ensureData(guildId: string, force?: boolean) {
    if (force || !this.data) {
      this.data = {
        ...(yaml.load(
          await (
            await fetch(
              'https://raw.githubusercontent.com/home-assistant/service-hub/main/data/discord/messages/common.yaml',
            )
          ).text(),
          {
            json: true,
          },
        ) as MessageData),
        ...((guildId in GUILD_MESSAGES
          ? yaml.load(await (await fetch(GUILD_MESSAGES[guildId])).text(), {
              json: true,
            })
          : []) as MessageData),
      };
    }
  }
}
