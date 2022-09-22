import { Issue, IssuesOpenedEvent } from '@octokit/webhooks-types';
import { Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { extractIntegrationDocumentationLinks } from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

export class SetIntegration extends BaseWebhookHandler {
  async handle(context: WebhookContext<IssuesOpenedEvent>) {
    if (
      context.senderIsBot ||
      context.eventType !== 'issues.opened' ||
      ![Repository.CORE, Repository.HOME_ASSISTANT_IO].includes(context.repo().repo as Repository)
    ) {
      return;
    }

    for (const link of extractIntegrationDocumentationLinks(
      (context.payload.issue as Issue).body,
    )) {
      const label = `integration: ${link.integration}`;
      const exist = await context.github.issues.getLabel(
        context.issue({ name: label, repo: Repository.CORE }),
      );
      if (exist.status === 200 && exist.data.name === label) {
        context.scheduleIssueLabel(label);
      }
    }
  }
}
