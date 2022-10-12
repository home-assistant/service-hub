import { IssuesLabeledEvent, PullRequestLabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

import { fetchIntegrationManifest, QualityScale } from '../utils/integration';

export class QualityScaleLabeler extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.ISSUES_LABELED, EventType.PULL_REQUEST_LABELED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  async handle(context: WebhookContext<IssuesLabeledEvent | PullRequestLabeledEvent>) {
    if (!context.payload.label || !context.payload.label.name.startsWith('integration: ')) {
      return;
    }

    const domain = context.payload.label.name.split('integration: ')[1];
    const manifest = await fetchIntegrationManifest(domain);

    if (manifest) {
      context.scheduleIssueLabel(
        `Quality Scale: ${manifest.quality_scale || QualityScale.NO_SCORE}`,
      );
    }
  }
}
