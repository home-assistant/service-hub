import { PullRequestLabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

import { fetchPullRequestFilesFromContext } from '../utils/pull_request';
import { ParsedPath } from '../utils/parse_path';

export class NewIntegrationsHandler extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.PULL_REQUEST_LABELED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  private getPlatformIssue(parsed: ParsedPath[]): string | undefined {
    const hasMultiplePlatforms = parsed.filter((path) => path.type === 'platform').length > 1;

    if (!hasMultiplePlatforms) {
      return undefined;
    }

    return 'When adding new integrations, limit included platforms to a single platform. Please reduce this PR to a single platform. See the [review process](https://developers.home-assistant.io/docs/review-process/#home-assistant-core) for more details.';
  }

  private getBrandIssue(parsed: ParsedPath[]): string | undefined {
    const hasBrandFolder = parsed.some((path) => path.type === 'brand');

    if (!hasBrandFolder) {
      return undefined;
    }

    return 'This PR includes a `brand` folder inside the component. Brand assets should not be part of the core repository. Please refer to the [brand images documentation](https://developers.home-assistant.io/docs/core/integration/brand_images) for the correct approach.';
  }

  /**
   * When a new-integration label is added, check if the PR contains multiple platforms
   * or a brand sub-folder. If so, request changes with a combined message.
   */
  async handle(context: WebhookContext<PullRequestLabeledEvent>) {
    if (context.payload.label?.name !== 'new-integration') {
      return;
    }

    const pullRequestFiles = await fetchPullRequestFilesFromContext(context);
    const parsed = pullRequestFiles.map((file) => new ParsedPath(file));

    const issueCheckers = [this.getPlatformIssue, this.getBrandIssue];
    const issues = issueCheckers
      .map((checker) => checker.call(this, parsed))
      .filter((issue): issue is string => Boolean(issue));

    if (issues.length === 0) {
      return;
    }

    await context.github.pulls.createReview(
      context.pullRequest({
        body: issues.join('\n\n'),
        event: 'REQUEST_CHANGES',
      }),
    );
  }
}
