import {
  DiscordTransformedCommand,
  Payload,
  TransformedCommandExecutionContext,
} from '@discord-nestjs/core';
import { BlankDto } from '../discord.const';
import { CommandHandler, DiscordCommandClass } from '../discord.decorator';

@DiscordCommandClass({
  name: 'ping',
  description: 'Returns pong',
})
export class PingCommand implements DiscordTransformedCommand<any> {
  @CommandHandler()
  async handler(
    @Payload() handlerDto: BlankDto,
    { interaction }: TransformedCommandExecutionContext,
  ): Promise<void> {
    await interaction.reply('pong');
  }
}
