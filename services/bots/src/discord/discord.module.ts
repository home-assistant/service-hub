import { Module } from '@nestjs/common';
import { DiscordModule } from '@discord-nestjs/core';
import { PingCommand } from './commands/ping';
import { VersionsCommand } from './commands/versions';
import { IntegrationCommand } from './commands/integration';
import { MessageCommand } from './commands/message';
import { MyCommand } from './commands/my';
import { IntegrationDataService } from './services/integration-data';
import { MyRedirectDataService } from './services/my-redirect-data';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [
    IntegrationDataService,
    MyRedirectDataService,
    PingCommand,
    VersionsCommand,
    IntegrationCommand,
    MessageCommand,
    MyCommand,
  ],
})
export class DiscordBotModule {}
