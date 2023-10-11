import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext, triggerType } from '../const';
import { IssueCommentCommandBase } from './base';

export class RenameIssueCommentCommand implements IssueCommentCommandBase {
  command = 'rename';
  exampleAdditional = 'Awesome new title';
  invokerType = 'code_owner';
  requireAdditional = true;

  description(context: WebhookContext<any>) {
    return `Renames the ${triggerType(context)}.`;
  }

  async handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
    if (!invokerIsCodeOwner(command)) {
      throw new Error('Only the code owner can rename the issue.');
    }

    await context.github.issues.update(context.issue({ title: command.additional }));
  }
}
