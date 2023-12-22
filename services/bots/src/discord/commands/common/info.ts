import { InteractionEvent } from '@discord-nestjs/core';
import { getVersionInfo } from '@lib/common';
import { ChatInputCommandInteraction } from 'discord.js';
import { CommandHandler, DiscordCommandClass } from '../../discord.decorator';

const version = getVersionInfo(__dirname);

@DiscordCommandClass({
  name: 'info',
  description: 'Returns bot information',
})
export class CommandCommonInfo {
  @CommandHandler()
  async handler(@InteractionEvent() interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({
      embeds: [
        {
          fields: [
            { name: 'Version', value: version.version, inline: true },
            {
              name: 'Source',
              value: '[Source Repository](https://github.com/home-assistant/service-hub)',
              inline: true,
            },
            {
              name: 'Messages',
              value:
                '[Data for the /message command](https://github.com/home-assistant/service-hub/tree/main/data/discord/messages)',
              inline: true,
            },
          ],
        },
      ],
    });
  }
}
