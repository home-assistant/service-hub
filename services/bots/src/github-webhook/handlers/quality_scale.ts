import { IssuesLabeledEvent, PullRequestLabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

import { fetchIntegrationManifest, QualityScale } from '../utils/integration';

export class QualityScaleLabeler extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.PULL_REQUEST_LABELED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  async handle(context: WebhookContext<IssuesLabeledEvent | PullRequestLabeledEvent>) {
    if (!context.payload.label || !context.payload.label.name.startsWith('integration: ')) {
      return;
    }

    // When a PR is opened there can be a lot of labels added.
    // We only want to add quality scale labels if only 1 integration is touched.
    // To handle this we need to do an API call to get the current labels.
    const currentLabels = (await context.github.issues.listLabelsOnIssue(context.issue())).data.map(
      (label) => label.name,
    );

    const currentIntegrationLabels = currentLabels.filter((label) =>
      label.startsWith('integration: '),
    );

    if (currentIntegrationLabels.length !== 1) {
      // Check if we need to cleanup labels
      const qualityScaleLabels = currentLabels.filter((label) =>
        label.startsWith('Quality Scale: '),
      );
      if (qualityScaleLabels.length !== 0) {
        for (const label of qualityScaleLabels) {
          try {
            await context.github.issues.removeLabel(context.issue({ name: label }));
          } catch (_) {
            // Ignore issues here.
          }
        }
      }
      return;
    }

    const domain = currentIntegrationLabels[0].split('integration: ')[1];
    const manifest = await fetchIntegrationManifest(domain);

    if (manifest) {
      context.scheduleIssueLabel(
        `Quality Scale: ${manifest.quality_scale || QualityScale.NO_SCORE}`,
      );
    }
  }
}
