import { TransformPipe } from '@discord-nestjs/common';
import { Command, DiscordTransformedCommand, UsePipes } from '@discord-nestjs/core';

@Command({
  name: 'ping',
  description: 'Returns pong',
})
@UsePipes(TransformPipe)
export class PingCommand implements DiscordTransformedCommand<any> {
  handler(): string {
    return 'pong';
  }
}
