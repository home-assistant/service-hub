import { PullRequestReviewSubmittedEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

const COMMUNITY_APPROVED_LABEL = 'community-approved';

export class CommunityApproved extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.PULL_REQUEST_REVIEW_SUBMITTED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  async handle(context: WebhookContext<PullRequestReviewSubmittedEvent>) {
    const submittedState = context.payload.review.state;
    if (submittedState !== 'approved' && submittedState !== 'changes_requested') {
      return;
    }

    const reviews = await context.github.paginate(
      context.github.pulls.listReviews,
      context.pullRequest({ per_page: 100 }),
    );

    // listReviews returns reviews in chronological order; keep the latest
    // approval-bearing state per human reviewer so a later changes_requested
    // overrides an earlier approval (and vice versa).
    const latestStateByUser = new Map<string, string>();
    for (const review of reviews) {
      if (!review.user || review.user.type.toLowerCase() === 'bot') {
        continue;
      }
      if (
        review.state !== 'APPROVED' &&
        review.state !== 'CHANGES_REQUESTED' &&
        review.state !== 'DISMISSED'
      ) {
        continue;
      }
      latestStateByUser.set(review.user.login, review.state);
    }

    const approverCount = [...latestStateByUser.values()].filter(
      (state) => state === 'APPROVED',
    ).length;
    const hasLabel = context.payload.pull_request.labels.some(
      (label) => label.name === COMMUNITY_APPROVED_LABEL,
    );

    if (approverCount >= 2 && !hasLabel) {
      context.scheduleIssueLabel(COMMUNITY_APPROVED_LABEL);
    } else if (approverCount < 2 && hasLabel) {
      try {
        await context.github.issues.removeLabel(
          context.issue({ name: COMMUNITY_APPROVED_LABEL }),
        );
      } catch {
        // Label may already be gone
      }
    }
  }
}
