import { EmbedBuilder } from 'discord.js';
import { CommandHandler, DiscordCommandClass } from '../../discord.decorator';
import {
  DiscordTransformedCommand,
  Payload,
  TransformedCommandExecutionContext,
  UsePipes,
} from '@discord-nestjs/core';
import { TransformPipe } from '@discord-nestjs/common';
import { BlankDto } from '../../discord.const';

@DiscordCommandClass({
  name: 'versions',
  description: 'Returns version information',
})
@UsePipes(TransformPipe)
export class CommandHomeAssistantVersions implements DiscordTransformedCommand<any> {
  @CommandHandler()
  async handler(
    @Payload() handlerDto: BlankDto,
    { interaction }: TransformedCommandExecutionContext,
  ): Promise<void> {
    const [betaResponse, stableResponse] = await Promise.all([
      fetch('https://version.home-assistant.io/beta.json'),
      fetch('https://version.home-assistant.io/stable.json'),
    ]);

    const beta = await betaResponse.json();
    const stable = await stableResponse.json();

    await interaction.reply({
      embeds: [
        new EmbedBuilder({
          fields: [
            { name: 'Core stable', value: stable.homeassistant.default, inline: true },
            { name: 'Core beta', value: beta.homeassistant.default, inline: true },
            { name: 'OS stable', value: stable.hassos.ova, inline: true },
            { name: 'OS beta', value: beta.hassos.ova, inline: true },
            { name: 'Supervisor stable', value: stable.supervisor, inline: true },
            { name: 'Supervisor beta', value: beta.supervisor, inline: true },
          ],
        }),
      ],
    });
  }
}
