import { TransformPipe } from '@discord-nestjs/common';
import {
  DiscordTransformedCommand,
  Payload,
  TransformedCommandExecutionContext,
  UsePipes,
} from '@discord-nestjs/core';
import { BlankDto } from '../discord.const';
import { CommandHandler, DiscordCommandClass } from '../discord.decorator';

@DiscordCommandClass({
  name: 'ping',
  description: 'Returns pong',
})
@UsePipes(TransformPipe)
export class PingCommand implements DiscordTransformedCommand<any> {
  @CommandHandler()
  async handler(
    @Payload() handlerDto: BlankDto,
    { interaction }: TransformedCommandExecutionContext,
  ): Promise<void> {
    await interaction.reply('pong');
  }
}
