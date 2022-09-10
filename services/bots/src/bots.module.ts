import { getVersionInfo } from '@lib/common';
import { SentryModule } from '@lib/sentry';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import Config, { AppConfig } from './config';
import { GithubWebhookModule } from './github-webhook/github-webhook.module';

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
  ],
})
export class BotsModule {}
