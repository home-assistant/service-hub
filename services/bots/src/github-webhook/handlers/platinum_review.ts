import {
  PullRequestLabeledEvent,
  PullRequestOpenedEvent,
  PullRequestReopenedEvent,
  PullRequestReviewSubmittedEvent,
  PullRequestSynchronizeEvent,
  PullRequestUnlabeledEvent,
} from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';
import { fetchIntegrationManifest, QualityScale } from '../utils/integration';
import { expandOrganizationTeams } from '../utils/organization_teams';

export class PlatinumReview extends BaseWebhookHandler {
  public allowedEventTypes = [
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.PULL_REQUEST_UNLABELED,
  ];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  async handle(
    context: WebhookContext<
      | PullRequestLabeledEvent
      | PullRequestOpenedEvent
      | PullRequestReopenedEvent
      | PullRequestReviewSubmittedEvent
      | PullRequestSynchronizeEvent
      | PullRequestUnlabeledEvent
    >,
  ) {
    const currentLabels = context.payload.pull_request.labels.map((label) => label.name);
    const integrations = currentLabels.filter((label) => label.startsWith('integration: '));

    let requiresCodeownerApproval =
      currentLabels.includes(`Quality Scale: ${QualityScale.PLATINUM}`) &&
      integrations.length === 1 &&
      !currentLabels.find((label) => ['by-code-owner', 'code-owner-approved'].includes(label));

    if (requiresCodeownerApproval) {
      const manifest = await fetchIntegrationManifest(integrations[0].substring(13));

      if (!manifest?.codeowners?.length) {
        requiresCodeownerApproval = false;
      } else {
        // We have a list of codeowners, check if someone from there has approved.
        const reviews = await context.github.pulls.listReviews(
          context.pullRequest({ per_page: 100 }),
        );
        const expandedOwners = await expandOrganizationTeams(context, manifest.codeowners);

        if (
          reviews.data.find(
            (review) =>
              review.state === 'APPROVED' &&
              expandedOwners.includes(review.user.login.toLowerCase()),
          )
        ) {
          // A code owner did approve, it's done.
          context.scheduleIssueLabel('code-owner-approved');
          requiresCodeownerApproval = false;
        }
      }
    }

    await context.github.repos.createCommitStatus(
      context.repo({
        sha: context.payload.pull_request.head.sha,
        context: 'code-owner-approval',
        state: requiresCodeownerApproval ? 'failure' : 'success',
        description: requiresCodeownerApproval
          ? `Code owner approval required for Platinum integrations before merging`
          : `Code owner approval ok.`,
        target_url:
          'https://developers.home-assistant.io/docs/core/integration-quality-scale/#-platinum',
      }),
    );
  }
}
