import { Issue, IssuesOpenedEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { extractDocumentationSectionsLinks } from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

export class SetDocumentationSection extends BaseWebhookHandler {
  public allowBots = false;
  public allowedEventTypes = [EventType.ISSUES_OPENED];
  public allowedRepositories = [HomeAssistantRepository.HOME_ASSISTANT_IO];

  async handle(context: WebhookContext<IssuesOpenedEvent>) {
    const foundSections = extractDocumentationSectionsLinks((context.payload.issue as Issue).body);

    if (foundSections.includes('integrations')) {
      // Don't do anything for integration sections
      return;
    }

    for (const section of foundSections) {
      const exist = await context.github.issuesGetLabel(context.issue({ name: section }));
      if (exist?.name === section) {
        context.scheduleIssueLabel(exist.name);
      }
    }
  }
}
