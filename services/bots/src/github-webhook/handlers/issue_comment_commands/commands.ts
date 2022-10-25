import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../github-webhook.model';
import { IntegrationManifest } from '../../utils/integration';
import { IssueCommentCommand, IssueCommentCommandContext } from './const';

export const ISSUE_COMMENT_COMMANDS: { [command: string]: IssueCommentCommand } = {
  close: {
    description: 'Closes the issue.',
    invokerType: 'code_owner',
    handler: async (
      context: WebhookContext<IssueCommentCreatedEvent>,
      command: IssueCommentCommandContext,
    ) => {
      if (!invokerIsCodeOwner(command)) {
        throw new Error('Only code owners can close issues.');
      }

      await context.github.issues.update(
        context.issue({
          state: 'closed',
        }),
      );
    },
  },
  rename: {
    description: 'Change the title of the issue.',
    exampleAdditional: 'Awesome new title',
    invokerType: 'code_owner',
    requireAdditional: true,
    handler: async (
      context: WebhookContext<IssueCommentCreatedEvent>,
      command: IssueCommentCommandContext,
    ) => {
      if (!invokerIsCodeOwner(command)) {
        throw new Error('Only the code owner can rename the issue.');
      }

      await context.github.issues.update(context.issue({ title: command.additional }));
    },
  },
  reopen: {
    description: 'Reopen the issue.',
    invokerType: 'code_owner',
    handler: async (
      context: WebhookContext<IssueCommentCreatedEvent>,
      command: IssueCommentCommandContext,
    ) => {
      if (!invokerIsCodeOwner(command)) {
        throw new Error('Only code owners can reopen issues.');
      }

      await context.github.issues.update(
        context.issue({
          state: 'open',
        }),
      );
    },
  },
  unassign: {
    description:
      'Removes the current integration label and assignees on the issue, add the integration domain after the command.',
    exampleAdditional: '<domain>',
    invokerType: 'code_owner',
    requireAdditional: true,
    handler: async (
      context: WebhookContext<IssueCommentCreatedEvent>,
      command: IssueCommentCommandContext,
    ) => {
      const manifest = command.integrationManifests[command.additional];
      if (!invokerIsCodeOwner(command, manifest)) {
        throw new Error('Only code owners can unassign themselves.');
      }
      await context.github.issues.removeLabel(
        context.issue({
          name: `integration: ${command.additional}`,
        }),
      );
      const currentAssignees = context.payload.issue.assignees
        .map((assignee) => assignee.login)
        .filter((assignee) => manifest.codeowners?.includes(`@${assignee}`));
      if (currentAssignees.length) {
        await context.github.issues.removeAssignees(
          context.issue({
            assignees: currentAssignees,
          }),
        );
      }
    },
  },
};

const invokerIsCodeOwner = (
  command: IssueCommentCommandContext,
  manifest?: IntegrationManifest,
): boolean => {
  let integrationManifest = manifest;
  if (!integrationManifest) {
    const integrationDomains = Object.keys(command.integrationManifests);
    integrationManifest =
      integrationDomains.length === 1
        ? command.integrationManifests[integrationDomains[0]]
        : undefined;
  }

  return integrationManifest?.codeowners?.includes(`@${command.invoker}`);
};
