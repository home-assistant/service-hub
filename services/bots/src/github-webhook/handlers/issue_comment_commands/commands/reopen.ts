import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext } from '../const';
import { IssueCommentCommandBase } from './base';

export class ReopenIssueCommentCommand implements IssueCommentCommandBase {
  command = 'reopen';
  description = 'Reopen the <type>.';
  invokerType = 'code_owner';

  async handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
    if (!invokerIsCodeOwner(command)) {
      throw new Error('Only code owners can reopen issues.');
    }

    await context.github.issues.update(
      context.issue({
        state: 'open',
      }),
    );
  }
}
