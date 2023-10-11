import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { IssueCommentCommandContext } from '../const';

export abstract class IssueCommentCommandBase {
  command: string;
  invokerType?: string;
  requireAdditional?: boolean;
  exampleAdditional?: string;

  abstract description(context: WebhookContext<any>): string;

  abstract handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ): Promise<void>;
}
