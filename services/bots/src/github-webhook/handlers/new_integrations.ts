import { PullRequestLabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

import { fetchPullRequestFilesFromContext } from '../utils/pull_request';
import { ParsedPath } from '../utils/parse_path';

export class NewIntegrationsHandler extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.PULL_REQUEST_LABELED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  /**
   * When a new-integration label is added, check if the PR contains multiple platforms.
   * If so, request changes. The ReviewDrafter will handle the rest.
   */
  async handle(context: WebhookContext<PullRequestLabeledEvent>) {
    if (context.payload.label?.name !== 'new-integration') {
      return;
    }

    const pullRequestFiles = await fetchPullRequestFilesFromContext(context);
    const parsed = pullRequestFiles.map((file) => new ParsedPath(file));

    const integrationPlatforms = parsed.filter((path) => path.type === 'platform');

    if (integrationPlatforms.length > 1) {
      await context.github.pulls.createReview(
        context.pullRequest({
          body: '[When adding new integrations, limit included platforms to a single platform. Please reduce this PR to a single platform](https://developers.home-assistant.io/docs/review-process/#home-assistant-core)',
          event: 'REQUEST_CHANGES',
        }),
      );
    }
  }
}
