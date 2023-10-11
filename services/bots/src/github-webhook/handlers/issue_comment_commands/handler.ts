import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../../github-webhook.const';
import { WebhookContext } from '../../github-webhook.model';
import { fetchIntegrationManifest } from '../../utils/integration';
import { BaseWebhookHandler } from '../base';
import { IssueCommentCommandBase } from './commands/base';

import { CloseIssueCommentCommand } from './commands/close';
import { RenameIssueCommentCommand } from './commands/rename';
import { ReopenIssueCommentCommand } from './commands/reopen';
import { UnassignIssueCommentCommand } from './commands/unassign';
import { LabelAddCommentCommand } from './commands/label-add';
import { LabelRemoveCommentCommand } from './commands/label-remove';

const COMMAND_REGEX: RegExp =
  /^(?<tagged>@home-assistant)\s(?<command>[\w|-]*)(\s(?<additional>.*))?$/;

export const ISSUE_COMMENT_COMMANDS: IssueCommentCommandBase[] = [
  new CloseIssueCommentCommand(),
  new RenameIssueCommentCommand(),
  new ReopenIssueCommentCommand(),
  new UnassignIssueCommentCommand(),
  new LabelAddCommentCommand(),
  new LabelRemoveCommentCommand(),
];

export class IssueCommentCommands extends BaseWebhookHandler {
  public allowBots = false;
  public allowedEventTypes = [EventType.ISSUE_COMMENT_CREATED];
  public allowedRepositories = [
    HomeAssistantRepository.CORE,
    HomeAssistantRepository.HOME_ASSISTANT_IO,
  ];

  async handle(context: WebhookContext<IssueCommentCreatedEvent>) {
    const input = COMMAND_REGEX.exec(context.payload.comment.body || '')?.groups;

    if (!input) {
      return;
    }

    const command = ISSUE_COMMENT_COMMANDS.find((command) => command.command === input.command);
    if (!command || (command.requireAdditional && !input.additional)) {
      await context.github.reactions.createForIssueComment(
        context.repo({ comment_id: context.payload.comment.id, content: '-1' }),
      );
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

    try {
      await command.handle(context, {
        invoker: context.payload.comment.user.login,
        additional: input.additional,
        currentLabels,
        integrationManifests,
      });
      await context.github.reactions.createForIssueComment(
        context.repo({ comment_id: context.payload.comment.id, content: '+1' }),
      );
    } catch (_) {
      await context.github.reactions.createForIssueComment(
        context.repo({ comment_id: context.payload.comment.id, content: '-1' }),
      );
    }
  }
}
