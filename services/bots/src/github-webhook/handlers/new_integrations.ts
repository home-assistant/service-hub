import { PullRequestLabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

import { fetchPullRequestFilesFromContext } from '../utils/pull_request';
import { ParsedPath } from '../utils/parse_path';

const REVIEW_COMMENT = `
When adding new integrations. Limit included platforms to a single platform, use the **Ready for review** button when you are done, thanks :+1:

[_Learn more about our pull request process._](https://developers.home-assistant.io/docs/review-process/#home-assistant-core)
`;

export class NewIntegrationsHandler extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.PULL_REQUEST_LABELED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  /**
   * When a new-integration label is added, check if the PR contains multiple platforms.
   * If so, convert the PR to a draft and request changes.
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
          body: REVIEW_COMMENT,
          event: 'REQUEST_CHANGES',
        }),
      );
      await context.convertPullRequestToDraft(context.payload.pull_request.node_id);
    }
  }
}
