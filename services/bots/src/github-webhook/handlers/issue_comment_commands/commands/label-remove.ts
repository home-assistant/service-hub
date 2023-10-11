import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import {
  invokerIsCodeOwner,
  IssueCommentCommandContext,
  ManageableLabels,
  triggerType,
} from '../const';
import { IssueCommentCommandBase } from './base';

export class LabelRemoveCommentCommand implements IssueCommentCommandBase {
  command = 'remove-label';
  exampleAdditional = 'needs-more-information';
  invokerType = 'code_owner';
  requireAdditional = true;

  description(context: WebhookContext<any>) {
    const validLabels = Array.from(ManageableLabels[context.repository]);
    return `Remove a label (${validLabels.join(', ')}) on the ${triggerType(context)}.`;
  }

  async handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
    if (!invokerIsCodeOwner(command)) {
      throw new Error('Only the code owner can remove labels.');
    }

    if (!ManageableLabels[context.repository].has(command.additional)) {
      throw new Error(
        `The requested label ${command.additional} is not valid for ${context.repository}`,
      );
    }

    if (!command.currentLabels.includes(command.additional)) {
      throw new Error(`The requested label ${command.additional} is not active on the issue.`);
    }

    await context.github.issues.removeLabel(context.issue({ name: command.additional }));
  }
}
