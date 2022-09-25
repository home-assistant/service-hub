import { Module } from '@nestjs/common';
import { DiscordModule } from '@discord-nestjs/core';
import { PingCommand } from './commands/ping';
import { VersionsCommand } from './commands/versions';
import { IntegrationCommand } from './commands/integration';
import { MessageCommand } from './commands/message';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [PingCommand, VersionsCommand, IntegrationCommand, MessageCommand],
})
export class DiscordBotModule {}
