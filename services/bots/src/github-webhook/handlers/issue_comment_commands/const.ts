import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../github-webhook.model';
import { IntegrationManifest } from '../../utils/integration';
import { HomeAssistantRepository } from '../../github-webhook.const';

export const ManageableLabels = {
  [HomeAssistantRepository.CORE]: new Set([
    'needs-more-information',
    'problem in dependency',
    'problem in custom component',
  ]),
  [HomeAssistantRepository.HOME_ASSISTANT_IO]: new Set(['needs-more-information']),
};

export const triggerType = (context: WebhookContext<any>) =>
  context.repository === HomeAssistantRepository.CORE
    ? context.eventType.startsWith('issues')
      ? 'issue'
      : 'pull request'
    : 'feedback';

export interface IssueCommentCommandContext {
  invoker: string;
  additional?: string;
  currentLabels: string[];
  integrationManifests: { [domain: string]: IntegrationManifest };
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
