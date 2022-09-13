import { Module } from '@nestjs/common';
import { DiscordModule } from '@discord-nestjs/core';
import { PingCommand } from './commands/ping';
import { VersionsCommand } from './commands/versions';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [PingCommand, VersionsCommand],
})
export class DiscordBotModule {}
