import { Module } from '@nestjs/common';
import { DiscordModule } from '@discord-nestjs/core';
import { PingCommand } from './commands/ping';
import { VersionsCommand } from './commands/versions';
import { IntegrationCommand } from './commands/integration';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [PingCommand, VersionsCommand, IntegrationCommand],
})
export class DiscordBotModule {}
