import { PullRequestEditedEvent, PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { EventType, Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

const BRANCH_LABELS: { [key: string]: Set<string> } = {
  [Repository.HOME_ASSISTANT_IO]: new Set(['current', 'rc', 'next']),
};

export class BranchLabels extends BaseWebhookHandler {
  public allowBots = false;
  public allowedRepositories = [Repository.HOME_ASSISTANT_IO];
  public allowedEventTypes = [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_EDITED];

  async handle(context: WebhookContext<PullRequestOpenedEvent | PullRequestEditedEvent>) {
    const targetBranch = context.payload.pull_request.base.ref;
    const currentLabels = context.payload.pull_request.labels.map((label) => label.name);

    if (
      BRANCH_LABELS[context.repositoryName].has(targetBranch) &&
      !currentLabels.includes(targetBranch)
    ) {
      context.scheduleIssueLabel(targetBranch);
    }

    // Find labels to remove
    currentLabels
      .filter((label) => BRANCH_LABELS[context.repositoryName].has(label) && label !== targetBranch)
      .forEach(
        async (label) => await context.github.issues.removeLabel(context.issue({ name: label })),
      );
  }
}
