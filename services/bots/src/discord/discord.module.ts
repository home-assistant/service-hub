import { Module } from '@nestjs/common';
import { DiscordModule } from '@discord-nestjs/core';
import { PingCommand } from './commands/ping';
import { PongCommand } from './commands/pong';
import { VersionCommand } from './commands/version';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [PingCommand, PongCommand, VersionCommand],
})
export class DiscordBotModule {}
