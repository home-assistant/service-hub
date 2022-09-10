import { getVersionInfo } from '@lib/common';
import { SentryModule } from '@lib/sentry';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { DiscordModule } from '@discord-nestjs/core';
import { GatewayIntentBits } from 'discord.js';

import Config, { AppConfig } from './config';
import { GithubWebhookModule } from './github-webhook/github-webhook.module';
import { DiscordBotModule } from './discord/discord.module';

const version = getVersionInfo(__dirname);

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [() => Config.getProperties()],
      isGlobal: true,
    }),
    SentryModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig>) => ({
        dsn: configService.get('sentryDsn'),
        environment: configService.get('env'),
        release: version.version,
      }),
    }),
    GithubWebhookModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        pinoHttp: {
          autoLogging: configService.get<string>('env') === 'development',
          level: configService.get<string>('logging.level'),
          name: configService.get<string>('logging.name'),
        },
      }),
    }),
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
    DiscordBotModule,
  ],
})
export class BotsModule {}
