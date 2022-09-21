import {
  PullRequestLabeledEvent,
  PullRequestSynchronizeEvent,
  PullRequestUnlabeledEvent,
} from '@octokit/webhooks-types';
import { Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

export class DocsMissing extends BaseWebhookHandler {
  async handle(
    context: WebhookContext<
      PullRequestLabeledEvent | PullRequestUnlabeledEvent | PullRequestSynchronizeEvent
    >,
  ) {
    if (
      !['pull_request.labeled', 'pull_request.unlabeled', 'pull_request.synchronize'].includes(
        context.eventType,
      ) ||
      context.repo().repo !== Repository.CORE
    ) {
      return;
    }

    const hasDocsMissingLabel = context.payload.pull_request.labels
      .map((label) => label.name)
      .includes('docs-missing');

    await context.github.repos.createCommitStatus(
      context.repo({
        sha: context.payload.pull_request.head.sha,
        context: 'docs-missing',
        state: hasDocsMissingLabel ? 'failure' : 'success',
        description: hasDocsMissingLabel ? `Please open a documentation PR.` : `Documentation ok.`,
      }),
    );
  }
}
