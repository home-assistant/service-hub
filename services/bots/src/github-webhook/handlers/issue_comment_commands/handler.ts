import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../../github-webhook.const';
import { WebhookContext } from '../../github-webhook.model';
import { fetchIntegrationManifest } from '../../utils/integration';
import { BaseWebhookHandler } from '../base';

import { ISSUE_COMMENT_COMMANDS } from './commands';

const commandRegex = /(?<tagged>@home-assistant)\s(?<command>\w*)(\s(?<additional>.*))?/;

export class IssueCommentCommands extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.ISSUE_COMMENT_CREATED];
  public allowedRepositories = [
    HomeAssistantRepository.CORE,
    HomeAssistantRepository.HOME_ASSISTANT_IO,
  ];

  async handle(context: WebhookContext<IssueCommentCreatedEvent>) {
    const input = commandRegex.exec(context.payload.comment.body || '')?.groups;

    if (!input) {
      return;
    }

    const command = ISSUE_COMMENT_COMMANDS[input.command];
    if (!command || (command.requireAdditional && !input.additional)) {
      return;
    }

    const currentLabels = context.payload.issue.labels.map((label) => label.name);
    const currentIntegrationFromLabels = currentLabels
      .filter((label) => label.startsWith('integration: '))
      .map((label) => label.split('integration: ')[1]);

    const integrationManifests = {};
    for (const integration of currentIntegrationFromLabels) {
      integrationManifests[integration] = await fetchIntegrationManifest(integration);
    }

    await command.handler(context, {
      invoker: context.payload.comment.user.login,
      additional: input.additional,
      currentLabels,
      integrationManifests,
    });
  }
}
