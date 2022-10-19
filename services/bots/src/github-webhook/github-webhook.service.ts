import { ServiceError } from '@lib/common';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAppAuth } from '@octokit/auth-app';

import { EventType, WEBHOOK_HANDLERS } from './github-webhook.const';
import { GithubClient, WebhookContext } from './github-webhook.model';
import { uniqueEntries } from './utils/list';

@Injectable()
export class GithubWebhookService {
  private githubClient: GithubClient;

  constructor(configService: ConfigService) {
    this.githubClient = new GithubClient({
      authStrategy: createAppAuth,
      auth: {
        appId: Number(configService.get('github.appId')),
        installationId: Number(configService.get('github.installationId')),
        privateKey: configService.get('github.keyContents'),
      },
    });
  }

  async handleWebhook(headers: Record<string, any>, payload: Record<string, any>): Promise<void> {
    const context = new WebhookContext({
      github: this.githubClient,
      eventType: `${headers['x-github-event']}.${payload.action}` as EventType,
      payload,
    });
    try {
      await Promise.all(
        WEBHOOK_HANDLERS.filter(
          (handler) =>
            (handler.allowBots || !context.senderIsBot) &&
            handler.allowedEventTypes.includes(context.eventType) &&
            (!handler.allowedOrganizations.length ||
              handler.allowedOrganizations.includes(context.organization)) &&
            (!handler.allowedRepositories.length ||
              handler.allowedRepositories.includes(context.repository)),
        ).map((handler) => handler.handle(context)),
      );
    } catch (err) {
      throw new ServiceError(`Could not process webhook (${err?.message})`, {
        cause: err,
        data: { context, payload },
        service: 'github-webhook',
      });
    }

    if (context.scheduledlabels.length) {
      await this.githubClient.issues.addLabels(
        context.issue({
          labels: uniqueEntries(context.scheduledlabels),
        }),
      );
    }

    if (context.scheduledComments.length) {
      await this.githubClient.issues.createComment(
        context.issue({
          body: context.scheduledComments
            .sort((a, b) => (a.priority || 10) - (b.priority || 10))
            .map(
              (entry) =>
                `${entry.comment}${
                  context.scheduledComments.length >= 2
                    ? `\n<sub><sup>(message by ${entry.handler})</sup></sub>`
                    : ''
                }`,
            )
            .join('\n\n---\n\n'),
        }),
      );
    }
  }
}
