import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import {
  invokerIsCodeOwner,
  IssueCommentCommandContext,
  ManageableLabels,
  triggerType,
} from '../const';
import { IssueCommentCommandBase } from './base';

export class LabelAddCommentCommand implements IssueCommentCommandBase {
  command = 'add-label';
  exampleAdditional = 'needs-more-information';
  invokerType = 'code_owner';
  requireAdditional = true;

  description(context: WebhookContext<any>) {
    const validLabels = Array.from(ManageableLabels[context.repository]);
    return `Add a label (${validLabels.join(', ')}) to the ${triggerType(context)}.`;
  }

  async handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
    if (!invokerIsCodeOwner(command)) {
      throw new Error('Only the code owner can add labels.');
    }

    if (!ManageableLabels[context.repository].has(command.additional)) {
      throw new Error(
        `The requested label ${command.additional} is not valid for ${context.repository}`,
      );
    }
    await context.github.issues.addLabels(context.issue({ labels: [command.additional] }));
  }
}
