import { PullRequestSynchronizeEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { ParsedPath } from '../utils/parse_path';
import { fetchPullRequestFilesFromContext } from '../utils/pull_request';
import { BaseWebhookHandler } from './base';
import { isSmallPR } from './label_bot/strategies/smallPR';

const SMALL_PR_LABEL = 'small-pr';

export class SmallPRLabelUpdater extends BaseWebhookHandler {
  public allowBots = false;
  public allowedRepositories = [HomeAssistantRepository.CORE];
  public allowedEventTypes = [EventType.PULL_REQUEST_SYNCHRONIZE];

  async handle(context: WebhookContext<PullRequestSynchronizeEvent>) {
    const currentLabels = new Set(
      context.payload.pull_request.labels.map((label) => label.name),
    );
    const hasLabel = currentLabels.has(SMALL_PR_LABEL);

    const files = await fetchPullRequestFilesFromContext(context);
    const parsed = files.map((file) => new ParsedPath(file));
    const shouldHaveLabel = isSmallPR(parsed);

    if (shouldHaveLabel && !hasLabel) {
      context.scheduleIssueLabel(SMALL_PR_LABEL);
    } else if (!shouldHaveLabel && hasLabel) {
      await context.github.issues.removeLabel(context.issue({ name: SMALL_PR_LABEL }));
    }
  }
}
