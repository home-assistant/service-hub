import { DiscordModule } from '@discord-nestjs/core';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GatewayIntentBits } from 'discord.js';
import Config from '../config';
import { DiscordCommands } from './commands';
import { DiscordListeners } from './listeners';
import { DiscordServices } from './services';

const config = Config.getProperties();

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
        ...DiscordServices.common,
        ...(DiscordServices[config.discord.guildId] || []),
        ...DiscordCommands.common,
        ...(DiscordCommands[config.discord.guildId] || []),
        ...DiscordListeners.common,
        ...(DiscordListeners[config.discord.guildId] || []),
      ],
    };
  }
}
