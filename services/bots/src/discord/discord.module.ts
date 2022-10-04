import { DynamicModule, Inject, Module, ModuleMetadata } from '@nestjs/common';
import { DiscordModule } from '@discord-nestjs/core';
import { PingCommand } from './commands/ping';
import { VersionsCommand } from './commands/versions';
import { IntegrationCommand } from './commands/integration';
import { MessageCommand } from './commands/message';
import { MyCommand } from './commands/my';
import { IntegrationDataService } from './services/integration-data';
import { MyRedirectDataService } from './services/my-redirect-data';
import { DiscordGuild } from './discord.const';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GatewayIntentBits } from 'discord.js';
import Config from '../config';

const config = Config.getProperties();

const PROVIDERS = {
  global: [PingCommand],
  [DiscordGuild.HOME_ASSISTANT]: [
    IntegrationDataService,
    MyRedirectDataService,
    VersionsCommand,
    IntegrationCommand,
    MessageCommand,
    MyCommand,
  ],
};

@Module({
  imports: [
    DiscordModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get('discord.token'),
        discordClientOptions: {
          intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
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
