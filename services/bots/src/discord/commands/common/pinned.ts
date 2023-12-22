import { InteractionEvent } from '@discord-nestjs/core';
import { ChatInputCommandInteraction } from 'discord.js';
import { CommandHandler, DiscordCommandClass } from '../../discord.decorator';

@DiscordCommandClass({
  name: 'pinned',
  description: 'Returns pinned messages',
})
export class CommandCommonPinned {
  @CommandHandler()
  async handler(@InteractionEvent() interaction: ChatInputCommandInteraction): Promise<void> {
    const pinned = await interaction.channel.messages.fetchPinned();

    if (pinned.size === 0) {
      await interaction.reply({ content: 'No pinned messages in this channel', ephemeral: true });
      return;
    }

    await interaction.reply({
      embeds: [
        {
          title: 'The pinned messages of this channel are:',
          description: pinned
            .map(
              (message) =>
                `- ["${transformContent(message.content) || 'embeded content'}"](<${message.url}>)`,
            )
            .join('\n'),
        },
      ],
    });
  }
}

const transformContent = (content: string): string => {
  const base = content.replace(/\n/g, ' ');
  return (base.length < 64 ? base : `${base.substring(0, 64)}...`)
    .replace(/</g, '')
    .replace(/>/g, '')
    .replace(/https?:\/\//g, '');
};
