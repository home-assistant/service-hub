import { Issue, IssuesOpenedEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
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
      const label = `integration: ${link.integration}`;
      const exist = await context.github.issuesGetLabel(
        context.issue({ name: label, repo: HomeAssistantRepository.CORE }),
      );
      if (exist?.name === label) {
        context.scheduleIssueLabel(label);
      }
    }
  }
}
