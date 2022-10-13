import { DiscordModule } from '@discord-nestjs/core';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GatewayIntentBits } from 'discord.js';
import Config from '../config';
import { ComponentsCommand } from './commands/components';
import { IntegrationCommand } from './commands/integration';
import { MessageCommand } from './commands/message';
import { MyCommand } from './commands/my';
import { PingCommand } from './commands/ping';
import { TopicCommand } from './commands/topic';
import { VersionsCommand } from './commands/versions';
import { DiscordGuild } from './discord.const';
import { LineCountEnforcer } from './listeners/line_count_enforcer';
import { ComponentDataService } from './services/component-data';
import { IntegrationDataService } from './services/integration-data';
import { MyRedirectDataService } from './services/my-redirect-data';

const config = Config.getProperties();

const PROVIDERS = {
  global: [PingCommand, TopicCommand],
  [DiscordGuild.HOME_ASSISTANT]: [
    IntegrationCommand,
    IntegrationDataService,
    MessageCommand,
    MyCommand,
    MyRedirectDataService,
    VersionsCommand,
  ],
  [DiscordGuild.ESPHOME]: [ComponentsCommand, ComponentDataService, LineCountEnforcer],
};

@Module({
  imports: [
    DiscordModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get('discord.token'),
        discordClientOptions: {
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
          ],
        },
        registerCommandOptions: [
          {
            forGuild: configService.get('discord.guildId'),
            removeCommandsBefore: true,
          },
        ],
        failOnLogin: true,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [],
})
export class DiscordBotModule {
  static register(): DynamicModule {
    return {
      module: DiscordBotModule,
      providers: [
        ...PROVIDERS.global,
        ...(config.discord.guildId in PROVIDERS ? PROVIDERS[config.discord.guildId] : []),
      ],
    };
  }
}
