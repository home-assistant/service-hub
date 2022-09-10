import { Module } from '@nestjs/common';
import { GithubWebhookService } from './github-webhook.service';

import { GithubWebhooksModule } from '@dev-thought/nestjs-github-webhooks';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from '../config';
import { GithubWebhookController } from './github-webhook.controller';
import { ValidateCla } from './handlers/validate-cla';

@Module({
  providers: [GithubWebhookService, ValidateCla],
  imports: [
    GithubWebhooksModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig>) => ({
        webhookSecret: configService.get('github.webhookSecret'),
      }),
    }),
  ],
  controllers: [GithubWebhookController],
})
export class GithubWebhookModule {}
