import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Octokit } from '@octokit/rest';
import { WebhookHandlerParams, WEBHOOK_HANDLERS, ISSUE_UPDATES } from './github-webhook.const';

@Injectable()
export class GithubWebhookService {
  private githubApiClient: Octokit;

  constructor(configService: ConfigService) {
    this.githubApiClient = new Octokit({ auth: configService.get('github.token') });
  }

  async handleWebhook(params: WebhookHandlerParams): Promise<void> {
    ISSUE_UPDATES[params.deliveryId] = {
      owner: params.payload.repository?.full_name.split('/')[0],
      repo: params.payload.repository?.full_name.split('/')[1],
      issue_number: params.payload.number,
      labels: [],
      comments: [],
    };

    await Promise.all(WEBHOOK_HANDLERS.map((handler) => handler.handle(params)));

    if (ISSUE_UPDATES[params.deliveryId].labels.length) {
      await this.githubApiClient.issues.addLabels({ ...ISSUE_UPDATES[params.deliveryId] });
    }
    if (ISSUE_UPDATES[params.deliveryId].comments.length) {
      await this.githubApiClient.issues.createComment({
        ...ISSUE_UPDATES[params.deliveryId],
        body: ISSUE_UPDATES[params.deliveryId].comments
          .map(
            (entry) =>
              `${entry.context}${
                ISSUE_UPDATES[params.deliveryId].comments.length >= 2
                  ? `\n<sub><sup>(message by ${entry.context})</sup></sub>`
                  : ''
              }`,
          )
          .join('\n\n---\n\n'),
      });
    }
  }
}
