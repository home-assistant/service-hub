import { DiscussionCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext } from '../../issue_comment_commands/const';
import { closeDiscussion, DiscussionCloseReason } from '../../../utils/discussion';
import { DiscussionCommentCommandBase } from './base';

const REASONS: { [key: string]: DiscussionCloseReason } = {
  resolved: 'RESOLVED',
  outdated: 'OUTDATED',
  duplicate: 'DUPLICATE',
};

export class CloseDiscussionCommentCommand extends DiscussionCommentCommandBase {
  command = 'close';
  invokerType = 'code_owner';

  async handle(
    context: WebhookContext<DiscussionCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
    if (!invokerIsCodeOwner(command)) {
      throw new Error('Only code owners can close discussions.');
    }

    const reason = REASONS[(command.additional || '').trim().toLowerCase()] || 'RESOLVED';
    await closeDiscussion(context, context.payload.discussion.node_id, reason);
    return true;
  }
}
