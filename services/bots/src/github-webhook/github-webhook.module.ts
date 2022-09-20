import { Module } from '@nestjs/common';
import { GithubWebhookService } from './github-webhook.service';

import { GithubWebhooksModule } from '@dev-thought/nestjs-github-webhooks';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from '../config';
import { GithubWebhookController } from './github-webhook.controller';
import { CodeOwnersMention } from './handlers/code_owners_mention';
import { Hacktoberfest } from './handlers/hacktoberfest';
import { IssueLinks } from './handlers/issue_links';
import { SetIntegration } from './handlers/set_integration';
import { ValidateCla } from './handlers/validate-cla';
import { DependencyBump } from './handlers/dependency_bump';
import { SetDocumentationSection } from './handlers/set_documentation_section';
import { ReviewEnforcer } from './handlers/review_enforcer';
import { DocsMissing } from './handlers/docs_missing';
import { BranchLabels } from './handlers/branch_labels';

@Module({
  providers: [
    CodeOwnersMention,
    DependencyBump,
    GithubWebhookService,
    Hacktoberfest,
    IssueLinks,
    SetIntegration,
    ReviewEnforcer,
    BranchLabels,
    DocsMissing,
    ValidateCla,
    SetDocumentationSection,
  ],
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
