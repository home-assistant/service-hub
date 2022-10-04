import { IssuesLabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

export class IssueLinks extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.ISSUES_LABELED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  async handle(context: WebhookContext<IssuesLabeledEvent>) {
    if (!context.payload.label || !context.payload.label.name.startsWith('integration: ')) {
      return;
    }

    const domain = context.payload.label.name.split('integration: ')[1];
    const docLink = `https://www.home-assistant.io/integrations/${domain}`;
    const codeLink = `https://github.com/home-assistant/core/tree/dev/homeassistant/components/${domain}`;
    context.scheduleIssueComment({
      handler: 'IssueLinks',
      comment: `[${domain} documentation](${docLink})\n[${domain} source](${codeLink})`,
    });
  }
}
