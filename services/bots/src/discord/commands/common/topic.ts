import { SlashCommandPipe } from '@discord-nestjs/common';
import { InteractionEvent } from '@discord-nestjs/core';
import { ChatInputCommandInteraction } from 'discord.js';
import { OptionalUserMentionDto } from '../../discord.const';
import { CommandHandler, DiscordCommandClass } from '../../discord.decorator';

@DiscordCommandClass({
  name: 'topic',
  description: 'Returns the topic of the current channel',
})
export class CommandCommonTopic {
  @CommandHandler()
  async handler(
    @InteractionEvent(SlashCommandPipe) handlerDto: OptionalUserMentionDto,
    @InteractionEvent() interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    // @ts-ignore not all channel types have topic
    const topic = interaction.channel.topic;
    await interaction.reply({
      embeds: topic
        ? [
            {
              title: 'The topic of this channel is:',
              description: [handlerDto.userMention, topic].join(' '),
            },
          ]
        : undefined,
      ephemeral: !topic,
      content: !topic ? 'This channel does not have a topic' : undefined,
    });
  }
}
