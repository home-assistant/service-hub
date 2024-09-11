import { PullRequestLabeledEvent, PullRequestUnlabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository, Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

export const LabelsToCheck: {
  [key in Repository]?: string[];
} = {
  [HomeAssistantRepository.CORE]: [
    'breaking-change',
    'bugfix',
    'code-quality',
    'dependency',
    'deprecation',
    'new-feature',
    'new-integration',
  ],
};

export class RequiredLabels extends BaseWebhookHandler {
  public allowedEventTypes = [
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
  ];
  public allowedRepositories = Object.keys(LabelsToCheck) as Repository[];

  async handle(context: WebhookContext<PullRequestLabeledEvent | PullRequestUnlabeledEvent>) {
    const currentLabels = new Set(context.payload.pull_request.labels.map((label) => label.name));
    const requiredLabels = LabelsToCheck[context.repository];

    const hasRequiredLabels = requiredLabels.some((label) => currentLabels.has(label));

    await context.github.repos.createCommitStatus(
      context.repo({
        sha: context.payload.pull_request.head.sha,
        context: 'required-labels',
        state: hasRequiredLabels ? 'success' : 'failure',
        description: `Has at least one of the required labels (${requiredLabels.join(', ')})`,
      }),
    );
  }
}
