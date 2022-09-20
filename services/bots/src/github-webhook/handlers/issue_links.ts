import { IssuesLabeledEvent } from '@octokit/webhooks-types';
import { Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

export class IssueLinks extends BaseWebhookHandler {
  async handle(context: WebhookContext) {
    const eventData = context.payload as IssuesLabeledEvent;
    if (
      context.eventType !== 'issues.labeled' ||
      context.issueContext.repo !== Repository.CORE ||
      !eventData.label ||
      !eventData.label.name.startsWith('integration: ')
    ) {
      return;
    }

    const domain = eventData.label.name.split('integration: ')[1];
    const docLink = `https://www.home-assistant.io/integrations/${domain}`;
    const codeLink = `https://github.com/home-assistant/core/tree/dev/homeassistant/components/${domain}`;
    context.scheduleIssueComment(
      'IssueLinks',
      `[${domain} documentation](${docLink})\n[${domain} source](${codeLink})`,
    );
  }
}
