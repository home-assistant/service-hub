import { PullRequestClosedEvent } from '@octokit/webhooks-types';
import { Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

// Map repositories to labels that need cleaning.
const TO_CLEAN: { [key: string]: string[] } = {
  [Repository.CORE]: ['Ready for review'],
  [Repository.HOME_ASSISTANT_IO]: [
    'needs-rebase',
    'in-progress',
    'awaits-parent',
    'ready-for-review',
    'parent-merged',
  ],
};

export class LabelCleaner extends BaseWebhookHandler {
  async handle(context: WebhookContext<PullRequestClosedEvent>) {
    const repositoryName = context.repo().repo;
    if (
      context.eventType !== 'pull_request.closed' ||
      ![Repository.CORE, Repository.HOME_ASSISTANT_IO].includes(repositoryName as Repository) ||
      !TO_CLEAN[repositoryName]?.length
    ) {
      return;
    }

    const currentLabels = context.payload.pull_request.labels.map((label) => label.name);

    TO_CLEAN[repositoryName]
      .filter((label) => currentLabels.includes(label))
      .forEach(async (label) => {
        await context.github.issues.removeLabel(context.issue({ name: label }));
      });
  }
}
