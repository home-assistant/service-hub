import { IssuesLabeledEvent, PullRequestLabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { fetchPullRequestFilesFromContext } from '../utils/pull_request';
import { BaseWebhookHandler } from './base';

import { fetchIntegrationManifest, QualityScale } from '../utils/integration';

export class QualityScaleLabeler extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.PULL_REQUEST_LABELED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  async handle(context: WebhookContext<IssuesLabeledEvent | PullRequestLabeledEvent>) {
    const files = await fetchPullRequestFilesFromContext(context);
    const filenames = files.map((file) => {
      const parts = file.filename.split('/');
      return parts[parts.length - 1];
    });

    if (filenames.includes('quality_scale.yaml')) {
      context.scheduleIssueLabel('quality-scale');
    }

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
