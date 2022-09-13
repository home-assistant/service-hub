import { TransformPipe } from '@discord-nestjs/common';
import { DiscordTransformedCommand, UsePipes } from '@discord-nestjs/core';
import { PermissionFlagsBits } from 'discord.js';
import { DiscordCommand } from '../discord.decorator';

@DiscordCommand({
  name: 'ping',
  description: 'Returns pong',
})
@UsePipes(TransformPipe)
export class PingCommand implements DiscordTransformedCommand<any> {
  handler(): string {
    return 'pong';
  }
}
