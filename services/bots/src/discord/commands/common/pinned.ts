import { TransformPipe } from '@discord-nestjs/common';
import {
  DiscordTransformedCommand,
  Payload,
  TransformedCommandExecutionContext,
  UsePipes,
} from '@discord-nestjs/core';
import { CommandHandler, DiscordCommandClass } from '../../discord.decorator';
import { BlankDto } from '../../discord.const';

@DiscordCommandClass({
  name: 'pinned',
  description: 'Returns pinned messages',
})
@UsePipes(TransformPipe)
export class CommandCommonPinned implements DiscordTransformedCommand<any> {
  @CommandHandler()
  async handler(
    @Payload() handlerDto: BlankDto,
    { interaction }: TransformedCommandExecutionContext,
  ): Promise<void> {
    const pinned = await interaction.channel.messages.fetchPinned();

    if (pinned.size === 0) {
      await interaction.reply({ content: 'No pinned messages in this channel', ephemeral: true });
      return;
    }

    await interaction.reply({
      embeds: [
        {
          title: 'The pinned messages of this channel is:',
          description: pinned
            .map(
              (message) =>
                `- ["${transformConetent(message.content) || 'embeded content'}"](<${
                  message.url
                }>)`,
            )
            .join('\n'),
        },
      ],
    });
  }
}

const transformConetent = (content: string): string => {
  const base = content.replace(/\n/g, '');
  return base.length < 64 ? base : `${base.substring(0, 64)}...`;
};
