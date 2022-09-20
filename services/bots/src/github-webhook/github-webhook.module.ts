import { Module } from '@nestjs/common';
import { GithubWebhookService } from './github-webhook.service';

import { GithubWebhooksModule } from '@dev-thought/nestjs-github-webhooks';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from '../config';
import { GithubWebhookController } from './github-webhook.controller';
import { BranchLabels } from './handlers/branch_labels';
import { CodeOwnersMention } from './handlers/code_owners_mention';
import { DependencyBump } from './handlers/dependency_bump';
import { DocsMissing } from './handlers/docs_missing';
import { DocsParenting } from './handlers/docs_parenting';
import { DocsTargetBranch } from './handlers/docs_target_branch';
import { Hacktoberfest } from './handlers/hacktoberfest';
import { IssueLinks } from './handlers/issue_links';
import { LabelBot } from './handlers/label_bot/handler';
import { LabelCleaner } from './handlers/label_cleaner';
import { ReviewEnforcer } from './handlers/review_enforcer';
import { SetDocumentationSection } from './handlers/set_documentation_section';
import { SetIntegration } from './handlers/set_integration';
import { ValidateCla } from './handlers/validate-cla';

@Module({
  providers: [
    BranchLabels,
    CodeOwnersMention,
    DependencyBump,
    DocsMissing,
    DocsParenting,
    DocsTargetBranch,
    GithubWebhookService,
    Hacktoberfest,
    IssueLinks,
    LabelBot,
    LabelCleaner,
    ReviewEnforcer,
    SetDocumentationSection,
    SetIntegration,
    ValidateCla,
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
