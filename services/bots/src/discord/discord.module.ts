import { Module } from '@nestjs/common';
import { DiscordModule } from '@discord-nestjs/core';
import { PingCommand } from './commands/ping';
import { PongCommand } from './commands/pong';
import { VersionsCommand } from './commands/versions';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [PingCommand, PongCommand, VersionsCommand],
})
export class DiscordBotModule {}
