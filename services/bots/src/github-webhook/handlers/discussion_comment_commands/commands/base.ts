import { DiscussionCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { IssueCommentCommandContext } from '../../issue_comment_commands/const';

export abstract class DiscussionCommentCommandBase {
  command: string;
  invokerType?: string;
  requireAdditional?: boolean;

  abstract handle(
    context: WebhookContext<DiscussionCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ): Promise<boolean>;
}
