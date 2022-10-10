import { Issue, IssuesOpenedEvent } from '@octokit/webhooks-types';
import { entityComponents, EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { extractIntegrationDocumentationLinks } from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

export class SetIntegration extends BaseWebhookHandler {
  public allowBots = false;
  public allowedEventTypes = [EventType.ISSUES_OPENED];
  public allowedRepositories = [
    HomeAssistantRepository.CORE,
    HomeAssistantRepository.HOME_ASSISTANT_IO,
  ];

  async handle(context: WebhookContext<IssuesOpenedEvent>) {
    for (const link of extractIntegrationDocumentationLinks(
      (context.payload.issue as Issue).body,
    )) {
      const integration =
        link.platform && entityComponents.has(link.integration) ? link.platform : link.integration;
      const label = `integration: ${integration}`;
      const exist = await context.github.issuesGetLabel(
        context.issue({ name: label, repo: 'core' }),
      );
      if (exist?.name === label) {
        context.scheduleIssueLabel(label);
      }
    }
  }
}
