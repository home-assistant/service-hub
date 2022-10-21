import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../github-webhook.model';
import { IntegrationManifest } from '../../utils/integration';

export interface IssueCommentCommandContext {
  invoker: string;
  additional?: string;
  currentLabels: string[];
  integrationManifests: { [domain: string]: IntegrationManifest };
}

export interface IssueCommentCommand {
  description: string;
  exampleAdditional?: string;
  invokerType?: 'code_owner';
  requireAdditional?: boolean;
  handler: (
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) => Promise<void>;
}
