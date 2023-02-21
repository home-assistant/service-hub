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

export const invokerIsCodeOwner = (
  command: IssueCommentCommandContext,
  manifest?: IntegrationManifest,
): boolean => {
  let integrationManifest = manifest;
  if (!integrationManifest) {
    const integrationDomains = Object.keys(command.integrationManifests);
    integrationManifest =
      integrationDomains.length === 1
        ? command.integrationManifests[integrationDomains[0]]
        : undefined;
  }

  return (
    integrationManifest?.codeowners
      // Strip the leading @ and convert to lowercase
      ?.map((codeowner) => codeowner.substring(1).toLowerCase())
      ?.includes(command.invoker.toLowerCase())
  );
};
