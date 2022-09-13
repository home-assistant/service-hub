import { ServiceError } from '@lib/common';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Octokit } from '@octokit/rest';
import { WEBHOOK_HANDLERS } from './github-webhook.const';
import { WebhookContext } from './github-webhook.model';

@Injectable()
export class GithubWebhookService {
  private githubApiClient: Octokit;

  constructor(configService: ConfigService) {
    this.githubApiClient = new Octokit({ auth: configService.get('github.token') });
  }

  async handleWebhook(context: WebhookContext): Promise<void> {
    try {
      await Promise.all(WEBHOOK_HANDLERS.map((handler) => handler.handle(context)));
    } catch (err) {
      throw new ServiceError('Could not prosesss webhook', { cause: err, data: { context } });
    }

    if (context.scheduledlabels.length) {
      await this.githubApiClient.issues.addLabels({
        ...context.issueContext,
        labels: context.scheduledlabels,
      });
    }

    if (context.scheduledComments.length) {
      await this.githubApiClient.issues.createComment({
        ...context.issueContext,
        body: context.scheduledComments
          .map(
            (entry) =>
              `${entry.context}${
                context.scheduledComments.length >= 2
                  ? `\n<sub><sup>(message by ${entry.context})</sup></sub>`
                  : ''
              }`,
          )
          .join('\n\n---\n\n'),
      });
    }
  }
}
