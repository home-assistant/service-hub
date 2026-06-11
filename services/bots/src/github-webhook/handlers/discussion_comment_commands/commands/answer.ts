import { DiscussionCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext } from '../../issue_comment_commands/const';
import { discussionCommentNodeId, markDiscussionCommentAsAnswer } from '../../../utils/discussion';
import { DiscussionCommentCommandBase } from './base';

export class AnswerDiscussionCommentCommand extends DiscussionCommentCommandBase {
  command = 'answer';
  invokerType = 'code_owner';

  async handle(
    context: WebhookContext<DiscussionCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
    if (!invokerIsCodeOwner(command)) {
      throw new Error('Only code owners can mark a discussion answer.');
    }

    const { discussion, comment } = context.payload;
    if (!discussion.category.is_answerable) {
      throw new Error('This discussion category does not accept answers.');
    }

    // Reply → mark its (top-level) parent; otherwise mark the command comment itself.
    let targetCommentId = comment.node_id;
    if (comment.parent_id) {
      const parentNodeId = await discussionCommentNodeId(
        context,
        discussion.number,
        comment.parent_id,
      );
      if (!parentNodeId) {
        throw new Error('Could not resolve the parent comment to mark as answer.');
      }
      targetCommentId = parentNodeId;
    }

    await markDiscussionCommentAsAnswer(context, targetCommentId);
    return true;
  }
}
