import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { IssueCommentCommandContext } from '../const';

export class IssueCommentCommandBase {
  command: string;
  description: string;
  invokerType?: string;
  requireAdditional?: boolean;

  async handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {}
}
