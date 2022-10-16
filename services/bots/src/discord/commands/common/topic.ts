import { TransformPipe } from '@discord-nestjs/common';
import {
  DiscordTransformedCommand,
  Payload,
  TransformedCommandExecutionContext,
  UsePipes,
} from '@discord-nestjs/core';
import { OptionalUserMentionDto } from '../../discord.const';
import { CommandHandler, DiscordCommandClass } from '../../discord.decorator';

@DiscordCommandClass({
  name: 'topic',
  description: 'Returns the topic of the current channel',
})
@UsePipes(TransformPipe)
export class CommandCommonTopic implements DiscordTransformedCommand<any> {
  @CommandHandler()
  async handler(
    @Payload() handlerDto: OptionalUserMentionDto,
    { interaction }: TransformedCommandExecutionContext,
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
