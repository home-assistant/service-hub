import { PullRequestLabeledEvent, PullRequestUnlabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository, Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

export const LabelsToCheck: {
  [key in Repository]?: Record<string, { message: string; success?: string }>;
} = {
  [HomeAssistantRepository.CORE]: {
    'awaiting-frontend': { message: 'This PR is awaiting changes to the frontend' },
  },
  [HomeAssistantRepository.FRONTEND]: {
    Blocked: { message: 'This PR has a blocker that must be resolved before merging' },
    'Do Not Review': { message: 'Review is on hold for this PR' },
    'has-parent': { message: 'This PR is waiting for its parent PR to merge' },
    'Needs UX': { message: 'This PR is awaiting UX review' },
    'wait for backend': { message: 'This PR is awaiting changes to the backend' },
  },
};

export class BlockingLabels extends BaseWebhookHandler {
  public allowedEventTypes = [
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
  ];
  public allowedRepositories = Object.keys(LabelsToCheck) as Repository[];

  async handle(context: WebhookContext<PullRequestLabeledEvent | PullRequestUnlabeledEvent>) {
    const currentLabels = new Set(context.payload.pull_request.labels.map((label) => label.name));

    for (const [label, description] of Object.entries(LabelsToCheck[context.repository] || {})) {
      const hasBlockingLabel = currentLabels.has(label);
      await context.github.createCommitStatusWithRetry(
        context.repo({
          sha: context.payload.pull_request.head.sha,
          context: `blocking-label-${label.toLowerCase().replace(' ', '-')}`,
          state: hasBlockingLabel ? 'failure' : 'success',
          description: hasBlockingLabel ? description['message'] : description['success'] || 'OK',
        }),
      );
    }
  }
}
