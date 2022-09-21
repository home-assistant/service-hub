import { PullRequestEditedEvent, PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

const BRANCH_LABELS: { [key: string]: Set<string> } = {
  [Repository.HOME_ASSISTANT_IO]: new Set(['current', 'rc', 'next']),
};

export class BranchLabels extends BaseWebhookHandler {
  async handle(context: WebhookContext<PullRequestOpenedEvent | PullRequestEditedEvent>) {
    const reposiotyName = context.repo().repo;
    if (
      !['pull_request.opened', 'pull_request.edited'].includes(context.eventType) ||
      !BRANCH_LABELS[reposiotyName]?.size
    ) {
      return;
    }

    const targetBranch = context.payload.pull_request.base.ref;
    const currentLabels = context.payload.pull_request.labels.map((label) => label.name);

    if (BRANCH_LABELS[reposiotyName].has(targetBranch) && !currentLabels.includes(targetBranch)) {
      context.scheduleIssueLabel(targetBranch);
    }

    // Find labels to remove
    currentLabels
      .filter((label) => BRANCH_LABELS[reposiotyName].has(label) && label !== targetBranch)
      .forEach(
        async (label) => await context.github.issues.removeLabel(context.issue({ name: label })),
      );
  }
}
