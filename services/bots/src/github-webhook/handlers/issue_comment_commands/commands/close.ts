import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext, triggerType } from '../const';
import { IssueCommentCommandBase } from './base';

export class CloseIssueCommentCommand extends IssueCommentCommandBase {
  command = 'close';
  invokerType = 'code_owner';

  description(context: WebhookContext<any>) {
    return `Closes the ${triggerType(context)}.`;
  }

  async handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
    if (!invokerIsCodeOwner(command)) {
      throw new Error('Only code owners can close issues.');
    }

    await context.github.issues.update(
      context.issue({
        state: 'closed',
      }),
    );
  }
}
