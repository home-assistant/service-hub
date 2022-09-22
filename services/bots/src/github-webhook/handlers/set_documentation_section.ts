import { Issue, IssuesOpenedEvent } from '@octokit/webhooks-types';
import { EventType, Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { extractDocumentationSectionsLinks } from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

export class SetDocumentationSection extends BaseWebhookHandler {
  public allowBots = false;
  public allowedEventTypes = [EventType.ISSUES_OPENED];
  public allowedRepositories = [Repository.HOME_ASSISTANT_IO];

  async handle(context: WebhookContext<IssuesOpenedEvent>) {
    const foundSections = extractDocumentationSectionsLinks((context.payload.issue as Issue).body);

    if (foundSections.includes('integration')) {
      // Don't do anything for integration sections
      return;
    }

    for (const section of foundSections) {
      const exist = await context.github.issues.getLabel(context.issue({ name: section }));
      if (exist.status === 200 && exist.data.name === section) {
        context.scheduleIssueLabel(exist.data.name);
      }
    }
  }
}
