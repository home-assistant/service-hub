import { Issue, IssuesOpenedEvent } from '@octokit/webhooks-types';
import { EventType, Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { extractIntegrationDocumentationLinks } from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

export class SetIntegration extends BaseWebhookHandler {
  public allowBots = false;
  public allowedEventTypes = [EventType.ISSUES_OPENED];
  public allowedRepositories = [Repository.CORE, Repository.HOME_ASSISTANT_IO];

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
