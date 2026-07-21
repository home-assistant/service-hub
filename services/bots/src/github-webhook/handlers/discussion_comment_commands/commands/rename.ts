import { DiscussionCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext } from '../../issue_comment_commands/const';
import { updateDiscussionTitle } from '../../../utils/discussion';
import { DiscussionCommentCommandBase } from './base';

export class RenameDiscussionCommentCommand extends DiscussionCommentCommandBase {
  command = 'rename';
  invokerType = 'code_owner';
  requireAdditional = true;

  async handle(
    context: WebhookContext<DiscussionCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
    if (!invokerIsCodeOwner(command)) {
      throw new Error('Only code owners can rename discussions.');
    }

    await updateDiscussionTitle(context, context.payload.discussion.node_id, command.additional);
    return true;
  }
}
