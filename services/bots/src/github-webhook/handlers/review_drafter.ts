import {
  PullRequestReadyForReviewEvent,
  PullRequestReviewSubmittedEvent,
} from '@octokit/webhooks-types';
import { EventType, Organization } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

const MESSAGE_ID = '<!-- ReviewDrafterComment -->';

const REVIEW_COMMENT = `${MESSAGE_ID}
Please take a look at the requested changes, and use the **Ready for review** button when you are done, thanks :+1:

[_Learn more about our pull request process._](https://developers.home-assistant.io/docs/review-process#prs-are-being-drafted-when-changes-are-needed)
`;

export class ReviewDrafter extends BaseWebhookHandler {
  public allowedEventTypes = [
    EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    EventType.PULL_REQUEST_READY_FOR_REVIEW,
  ];
  public allowedOrganizations = [Organization.HOME_ASSISTANT];

  async handle(
    context: WebhookContext<PullRequestReviewSubmittedEvent | PullRequestReadyForReviewEvent>,
  ) {
    if (context.eventType === EventType.PULL_REQUEST_REVIEW_SUBMITTED) {
      await this.handleReviewCommentSubmitted(
        context as WebhookContext<PullRequestReviewSubmittedEvent>,
      );
    } else if (context.eventType === EventType.PULL_REQUEST_READY_FOR_REVIEW) {
      await this.handleReadyForReview(context as WebhookContext<PullRequestReadyForReviewEvent>);
    }
  }

  async handleReviewCommentSubmitted(context: WebhookContext<PullRequestReviewSubmittedEvent>) {
    if (
      context.payload.pull_request.draft ||
      context.payload.review.state !== 'changes_requested'
    ) {
      // If the PR is already a draft, we don't need to do anything
      // If the review is not a changes requested, we don't need to do anything
      return;
    }

    if (context.payload.sender.type !== 'Bot') {
      // Check if the author is a member of the organization
      try {
        const { data: reviewerMembership } = await context.github.orgs.getMembershipForUser({
          org: context.organization,
          username: context.payload.review.user.login,
        });

        if (!['admin', 'member'].includes(reviewerMembership.role)) {
          // If the author is not admin or member, we don't need to do anything
          return;
        }
      } catch (ev: any) {
        // We get an error if the user is not a member of the organization
        return;
      }
    }

    // Mark PR as draft, this is not available in the REST API, so we use our helper
    await context.convertPullRequestToDraft(context.payload.pull_request.node_id);

    const currentComments = await context.github.issues.listComments(
      context.issue({ per_page: 100 }),
    );
    if (!currentComments.data.find((comment) => comment.body.startsWith(MESSAGE_ID))) {
      // No comment found, add one
      await context.github.issues.createComment(
        context.issue({
          body: REVIEW_COMMENT,
        }),
      );
    }
  }

  async handleReadyForReview(context: WebhookContext<PullRequestReadyForReviewEvent>) {
    const currentComments = await context.github.issues.listComments(
      context.issue({ per_page: 100 }),
    );
    if (!currentComments.data.find((comment) => comment.body.startsWith(MESSAGE_ID))) {
      // We did not add the comment, so we should not request a review
      return;
    }

    const { data: reviews } = await context.github.pulls.listReviews(
      context.pullRequest({ per_page: 100 }),
    );

    const requestedChanges = reviews.filter((review) => review.state === 'CHANGES_REQUESTED');
    const reviewers = new Set(
      requestedChanges
        .filter(
          // Sometimes GitHub sends it as "bot" and sometimes as "Bot
          (review) => review.user.type.toLowerCase() !== 'bot',
        )
        .map((review) => review.user.login),
    );

    if (reviewers.size) {
      // Request review from all reviewers that have requested changes.
      await context.github.pulls.requestReviewers(
        context.pullRequest({ reviewers: Array.from(reviewers) }),
      );
    }

    const botReviewes = requestedChanges.filter(
      // Sometimes GitHub sends it as "bot" and sometimes as "Bot
      (review) => review.user.type.toLowerCase() === 'bot',
    );

    for (const review of botReviewes) {
      // Dismiss all bot reviews
      await context.github.pulls.dismissReview(
        context.pullRequest({ review_id: review.id, message: 'Stale' }),
      );
    }
  }
}
