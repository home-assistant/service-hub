import { DiscussionCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext } from '../../issue_comment_commands/const';
import { reopenDiscussion } from '../../../utils/discussion';
import { DiscussionCommentCommandBase } from './base';

export class ReopenDiscussionCommentCommand extends DiscussionCommentCommandBase {
  command = 'reopen';
  invokerType = 'code_owner';

  async handle(
    context: WebhookContext<DiscussionCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
    if (!invokerIsCodeOwner(command)) {
      throw new Error('Only code owners can reopen discussions.');
    }

    await reopenDiscussion(context, context.payload.discussion.node_id);
    return true;
  }
}
