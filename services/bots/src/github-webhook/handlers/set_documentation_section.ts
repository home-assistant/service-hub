import { Issue, IssuesOpenedEvent } from '@octokit/webhooks-types';
import { Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { extractDocumentationSectionsLinks } from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

export class SetDocumentationSection extends BaseWebhookHandler {
  async handle(context: WebhookContext<IssuesOpenedEvent>) {
    if (
      context.senderIsBot ||
      context.eventType !== 'issues.opened' ||
      context.repo().repo !== Repository.HOME_ASSISTANT_IO
    ) {
      return;
    }

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
