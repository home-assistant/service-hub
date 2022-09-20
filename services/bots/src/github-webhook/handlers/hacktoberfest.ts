import { PullRequestClosedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

export const isHacktoberfestLive = () => new Date().getMonth() === 9;

export class Hacktoberfest extends BaseWebhookHandler {
  async handle(context: WebhookContext) {
    if (isHacktoberfestLive && context.eventType === 'pull_request.opened') {
      await this.handlePullRequestOpened(context);
    } else if (context.eventType === 'pull_request.closed') {
      await this.handlePullRequestClosed(context);
    }
  }

  async handlePullRequestOpened(context: WebhookContext) {
    context.scheduleIssueLabel('Hacktoberfest');
  }
  async handlePullRequestClosed(context: WebhookContext) {
    const pullRequest = (context.payload as PullRequestClosedEvent).pull_request;

    // Don't do something if the PR got merged or if it had no Hacktoberfest label.
    if (
      pullRequest.merged ||
      pullRequest.labels.find((label) => label.name === 'Hacktoberfest') == undefined
    ) {
      return;
    }

    // If a Hacktoberfest PR got closed, automatically remove the  "Hacktoberfest" label
    try {
      await this.githubApiClient.issues.removeLabel({
        ...context.issue(),
        name: 'Hacktoberfest',
      });
    } catch (_) {
      // ignroe missing label
    }
  }
}
