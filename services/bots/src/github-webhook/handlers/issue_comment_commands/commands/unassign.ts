import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext, triggerType } from '../const';
import { IssueCommentCommandBase } from './base';

export class UnassignIssueCommentCommand implements IssueCommentCommandBase {
  command = 'unassign';
  exampleAdditional = '<domain>';
  invokerType = 'code_owner';
  requireAdditional = true;

  description(context: WebhookContext<any>) {
    return `Removes the current integration label and assignees on the ${triggerType(
      context,
    )}, add the integration domain after the command.`;
  }

  async handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
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
  }
}
