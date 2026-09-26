import { Issue, IssuesOpenedEvent } from '@octokit/webhooks-types';
import { entityComponents, EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import {
  extractIntegrationDocumentationLinks,
  extractIntegrationFromBody,
  normalizeIntegrationName,
} from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

export class SetIntegration extends BaseWebhookHandler {
  public allowBots = false;
  public allowedEventTypes = [EventType.ISSUES_OPENED];
  public allowedRepositories = [
    HomeAssistantRepository.CORE,
    HomeAssistantRepository.HOME_ASSISTANT_IO,
  ];

  async handle(context: WebhookContext<IssuesOpenedEvent>) {
    const body = (context.payload.issue as Issue).body;

    // Try documentation links first (exact match, highest confidence)
    for (const link of extractIntegrationDocumentationLinks(body)) {
      const integration =
        link.platform && entityComponents.has(link.integration) ? link.platform : link.integration;
      const label = `integration: ${integration}`;
      const exist = await context.github.issuesGetLabel(
        context.issue({ name: label, repo: 'core' }),
      );
      if (exist?.name === label) {
        context.scheduleIssueLabel(label);
        return;
      }
    }

    // Fallback: try the "Integration causing the issue" body field
    const fromBody = extractIntegrationFromBody(body);
    if (!fromBody) {
      return;
    }

    for (const candidate of normalizeIntegrationName(fromBody)) {
      const label = `integration: ${candidate}`;
      const exist = await context.github.issuesGetLabel(
        context.issue({ name: label, repo: 'core' }),
      );
      if (exist?.name === label) {
        context.scheduleIssueLabel(label);
        return;
      }
    }
  }
}
