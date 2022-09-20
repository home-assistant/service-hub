import { ServiceError } from '@lib/common';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Octokit } from '@octokit/rest';
import { WEBHOOK_HANDLERS } from './github-webhook.const';
import { WebhookContext } from './github-webhook.model';

@Injectable()
export class GithubWebhookService {
  private githubClient: Octokit;

  constructor(configService: ConfigService) {
    this.githubClient = new Octokit({ auth: configService.get('github.token') });
  }

  async handleWebhook(headers: Record<string, any>, payload: Record<string, any>): Promise<void> {
    const context = new WebhookContext({
      github: this.githubClient,
      eventType: `${headers['x-github-event']}.${payload.action}`,
      payload,
    });
    try {
      await Promise.all(WEBHOOK_HANDLERS.map((handler) => handler.handle(context)));
    } catch (err) {
      throw new ServiceError('Could not process webhook', { cause: err, data: { context } });
    }

    if (context.scheduledlabels.length) {
      await this.githubClient.issues.addLabels(
        context.issue({
          labels: context.scheduledlabels,
        }),
      );
    }

    if (context.scheduledComments.length) {
      await this.githubClient.issues.createComment(
        context.issue({
          body: context.scheduledComments
            .map(
              (entry) =>
                `${entry.comment}${
                  context.scheduledComments.length >= 2
                    ? `\n<sub><sup>(message by ${entry.context})</sup></sub>`
                    : ''
                }`,
            )
            .join('\n\n---\n\n'),
        }),
      );
    }
  }
}
