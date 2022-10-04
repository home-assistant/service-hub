import { PullRequestClosedEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

// Map repositories to labels that need cleaning.
const TO_CLEAN: { [key: string]: string[] } = {
  [HomeAssistantRepository.CORE]: ['Ready for review'],
  [HomeAssistantRepository.HOME_ASSISTANT_IO]: [
    'needs-rebase',
    'in-progress',
    'awaits-parent',
    'ready-for-review',
    'parent-merged',
  ],
};

export class LabelCleaner extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.PULL_REQUEST_CLOSED];
  public allowedRepositories = [
    HomeAssistantRepository.CORE,
    HomeAssistantRepository.HOME_ASSISTANT_IO,
  ];

  async handle(context: WebhookContext<PullRequestClosedEvent>) {
    const currentLabels = context.payload.pull_request.labels.map((label) => label.name);

    TO_CLEAN[context.repository]
      .filter((label) => currentLabels.includes(label))
      .forEach(async (label) => {
        await context.github.issues.removeLabel(context.issue({ name: label }));
      });
  }
}
