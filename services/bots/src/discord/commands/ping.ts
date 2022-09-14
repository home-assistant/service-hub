import { DiscordTransformedCommand } from '@discord-nestjs/core';
import { CommandHandler, DiscordCommandClass } from '../discord.decorator';

@DiscordCommandClass({
  name: 'ping',
  description: 'Returns pong',
})
export class PingCommand implements DiscordTransformedCommand<any> {
  @CommandHandler()
  handler(): string {
    return 'pong';
  }
}
