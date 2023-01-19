import { Inject } from '@nestjs/common';
import { Client, Events } from 'discord.js';
import { OnDiscordEvent } from '../../discord.decorator';
import { ServiceCommonAnnouncementsData } from '../../services/common/announcements-data';
import Config from '../../../config';

const config = Config.getProperties();

export class ListenerCommonAnnouncements {
  @Inject() private serviceCommonAnnouncementsData: ServiceCommonAnnouncementsData;

  @OnDiscordEvent({ event: Events.ClientReady })
  async handler(client: Client): Promise<void> {
    await this.serviceCommonAnnouncementsData.ensureData(config.discord.guildId, true);

    for (const announcement of this.serviceCommonAnnouncementsData.data) {
      const channel = await client.channels.fetch(announcement.channel);
      if (!channel || !channel.isTextBased()) {
        continue;
      }

      const messages = [...(await channel.messages.fetch({ limit: 100 })).values()].filter(
        (mesage) => mesage.author.id === client.user.id,
      );
      if (messages.length !== announcement.messages.length) {
        // Count of messages is not the same, delete all and send new
        for (const message of messages.values()) {
          await message.delete();
        }
        for (const message of announcement.messages) {
          await channel.send(message.content);
        }
        continue;
      }
      for (const [idx, message] of announcement.messages.reverse().entries()) {
        // Update the messages if needed
        if (message.content.replace(/\s+/g, '') !== messages[idx].content.replace(/\s+/g, '')) {
          await messages[idx].edit(message.content);
        }
      }
    }
  }
}
