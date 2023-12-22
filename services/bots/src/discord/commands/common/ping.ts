import { InteractionEvent } from '@discord-nestjs/core';
import { ChatInputCommandInteraction } from 'discord.js';
import { CommandHandler, DiscordCommandClass } from '../../discord.decorator';

@DiscordCommandClass({
  name: 'ping',
  description: 'Returns pong',
})
export class CommandCommonPing {
  @CommandHandler()
  async handler(@InteractionEvent() interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply('pong');
  }
}
