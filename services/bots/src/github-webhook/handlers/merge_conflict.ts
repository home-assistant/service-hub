import { PullRequestOpenedEvent, PullRequestSynchronizeEvent } from '@octokit/webhooks-types';
import { ESPHomeRepository, EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

export class MergeConflictChecker extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_SYNCHRONIZE];
  public allowedRepositories = [HomeAssistantRepository.CORE, ESPHomeRepository.ESPHOME];

  async handle(context: WebhookContext<PullRequestOpenedEvent | PullRequestSynchronizeEvent>) {
    // The data in the event is stale, so we need to re-fetch it.
    const { data: pullRequest } = await context.github.pulls.get(context.pullRequest());

    if (pullRequest.mergeable_state !== 'dirty') {
      // The Pull request is not dirty.
      return;
    }

    // Create a review with a comment to let the user know that there is a merge conflict.
    await context.github.pulls.createReview(
      context.pullRequest({
        body: `There is a merge conflict.`,
        event: 'REQUEST_CHANGES',
      }),
    );
  }
}
