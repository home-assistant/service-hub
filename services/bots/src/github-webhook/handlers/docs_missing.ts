import {
  PullRequestLabeledEvent,
  PullRequestSynchronizeEvent,
  PullRequestUnlabeledEvent,
} from '@octokit/webhooks-types';
import { EventType, Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

export class DocsMissing extends BaseWebhookHandler {
  public allowedEventTypes = [
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
  ];
  public allowedRepositories = [Repository.CORE];

  async handle(
    context: WebhookContext<
      PullRequestLabeledEvent | PullRequestUnlabeledEvent | PullRequestSynchronizeEvent
    >,
  ) {
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
