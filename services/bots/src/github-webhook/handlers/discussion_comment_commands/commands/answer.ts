import { DiscussionCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext } from '../../issue_comment_commands/const';
import {
  addDiscussionReply,
  discussionCommentNodeId,
  markDiscussionCommentAsAnswer,
} from '../../../utils/discussion';
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

    // The answer is always a top-level comment, so it has to be identified by
    // replying to it; a standalone command comment has nothing meaningful to mark.
    if (!comment.parent_id) {
      await addDiscussionReply(
        context,
        discussion.node_id,
        comment.node_id,
        'To mark an answer, reply to the comment you want to mark with `@home-assistant answer`.',
      );
      return false;
    }

    const parentNodeId = await discussionCommentNodeId(
      context,
      discussion.number,
      comment.parent_id,
    );
    if (!parentNodeId) {
      throw new Error('Could not resolve the parent comment to mark as answer.');
    }

    await markDiscussionCommentAsAnswer(context, parentNodeId);
    return true;
  }
}
