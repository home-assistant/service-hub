import { Module } from '@nestjs/common';
import { GithubWebhookService } from './github-webhook.service';

import { GithubWebhooksModule } from '@dev-thought/nestjs-github-webhooks';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from '../config';
import { GithubWebhookController } from './github-webhook.controller';
import { IssueLinks } from './handlers/issue_links';
import { ValidateCla } from './handlers/validate-cla';
import { CodeOwnersMention } from './handlers/code_owners_mention';
import { Hacktoberfest } from './handlers/hacktoberfest';

@Module({
  providers: [GithubWebhookService, ValidateCla, IssueLinks, CodeOwnersMention, Hacktoberfest],
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
