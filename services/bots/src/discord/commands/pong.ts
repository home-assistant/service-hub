import { TransformPipe } from '@discord-nestjs/common';
import { Command, DiscordTransformedCommand, UsePipes } from '@discord-nestjs/core';

@Command({
  name: 'pong',
  description: 'Returns ping',
})
@UsePipes(TransformPipe)
export class PongCommand implements DiscordTransformedCommand<any> {
  handler(): string {
    return 'ping';
  }
}
