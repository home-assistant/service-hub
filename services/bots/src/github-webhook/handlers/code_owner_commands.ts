import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { fetchIntegrationManifest } from '../utils/integration';
import { BaseWebhookHandler } from './base';

export const CODE_OWNER_COMMANDS: {
  [command: string]: {
    description: string;
    handler: (context: WebhookContext<IssueCommentCreatedEvent>) => Promise<void>;
  };
} = {
  '/close': {
    description: 'Closes the issue.',
    handler: async (context: WebhookContext<IssueCommentCreatedEvent>) => {
      await context.github.issues.update(
        context.issue({
          state: 'closed',
        }),
      );
    },
  },
  '/rename': {
    description: 'Change the title of the issue.',
    handler: async (context: WebhookContext<IssueCommentCreatedEvent>) => {
      await context.github.issues.update(
        context.issue({
          title: context.payload.comment.body.replace('/rename ', ''),
        }),
      );
    },
  },
  '/unassign': {
    description: 'Removes the current integration label and assignees on the issue.',
    handler: async (context: WebhookContext<IssueCommentCreatedEvent>) => {
      await context.github.issues.removeLabel(
        context.issue({
          name: context.payload.issue.labels.find((label) =>
            label.name.startsWith('integration: '),
          )[0].name,
        }),
      );
      await context.github.issues.removeAssignees(
        context.issue({
          assignees: context.payload.issue.assignees.map((user) => user.login),
        }),
      );
    },
  },
};

export class CodeOwnerCommands extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.ISSUE_COMMENT_CREATED];
  public allowedRepositories = [
    HomeAssistantRepository.CORE,
    HomeAssistantRepository.HOME_ASSISTANT_IO,
  ];

  async handle(context: WebhookContext<IssueCommentCreatedEvent>) {
    const input = context.payload.comment.body?.trim().split(' ')[0];
    const currentLabels = context.payload.issue.labels
      .map((label) => label.name)
      .filter((label) => label.startsWith('integration: '));
    const command = CODE_OWNER_COMMANDS[input];
    if (!command || currentLabels.length !== 1) {
      // Return if there is no known command or if there is no integration label or if there are multiple integration labels
      return;
    }

    const integrationManifest = await fetchIntegrationManifest(
      currentLabels[0].split('integration: ')[1],
    );

    if (!integrationManifest.codeowners?.includes(`@${context.payload.comment.user.login}`)) {
      // Return if the user is not a code owner
      return;
    }

    await context.github.reactions.createForIssueComment(
      context.repo({ comment_id: context.payload.comment.id, content: '+1' }),
    );

    await command.handler(context);
  }
}
