import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { IntegrationCommand } from './commands/integration';
import { MessageCommand } from './commands/message';
import { MyCommand } from './commands/my';
import { PingCommand } from './commands/ping';
import { VersionsCommand } from './commands/versions';
import { LineCountEnforcer } from './listeners/line_count_enforcer';
import { IntegrationDataService } from './services/integration-data';
import { MyRedirectDataService } from './services/my-redirect-data';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [
    IntegrationCommand,
    IntegrationDataService,
    LineCountEnforcer,
    MessageCommand,
    MyCommand,
    MyRedirectDataService,
    PingCommand,
    VersionsCommand,
  ],
})
export class DiscordBotModule {}
