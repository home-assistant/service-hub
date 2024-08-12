import { ServiceError } from '@lib/common';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAppAuth } from '@octokit/auth-app';

import { Octokit } from '@octokit/rest';
import type { EndpointDefaults } from '@octokit/types';
import { EventType, WEBHOOK_HANDLERS } from './github-webhook.const';
import { GithubClient, WebhookContext } from './github-webhook.model';
import { uniqueEntries } from './utils/list';

const ignoredEventActions = new Set(['new_permissions_accepted']);

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
      throttle: {
        onRateLimit: (
          retryAfter: number,
          options: Required<EndpointDefaults>,
          octokit: Octokit,
          retryCount: number,
        ): boolean => {
          octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);

          if (retryCount < 2) {
            // Retry twice after hitting a rate limit error, then give up
            octokit.log.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onSecondaryRateLimit: (
          retryAfter: number,
          options: Required<EndpointDefaults>,
          octokit: Octokit,
        ) => {
          // does not retry, only logs a warning
          octokit.log.warn(
            `SecondaryRateLimit detected for request ${options.method} ${options.url}`,
          );
        },
      },
    });
  }

  async handleWebhook(headers: Record<string, any>, payload: Record<string, any>): Promise<void> {
    if (ignoredEventActions.has(payload.action)) {
      // We do not handle these events.
      return;
    }

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

      context.scheduledComments
        .filter((comment) => comment.close)
        .map(async (comment) => {
          await this.githubClient.issues.update(
            context.issue({
              state: 'closed',
              state_reason: comment.close_reason ?? 'completed',
            }),
          );
        });
    }
  }
}
