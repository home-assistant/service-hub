import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext } from '../const';
import { IssueCommentCommandBase } from './base';

export class CloseIssueCommentCommand extends IssueCommentCommandBase {
  command = 'close';
  description = 'Closes the <type>.';
  invokerType = 'code_owner';

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
