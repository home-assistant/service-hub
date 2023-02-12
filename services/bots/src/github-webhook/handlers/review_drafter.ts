import {
  PullRequestReadyForReviewEvent,
  PullRequestReviewSubmittedEvent,
} from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

const MESSAGE_ID = '<!-- ReviewDrafterComment -->';

const REVIEW_COMMENT = `${MESSAGE_ID}
Please take a look at the requested changes, and use the **Ready for review** button when you are done, thanks :+1:

[_Learn more about our pull request process._](https://developers.home-assistant.io/blog/2023/02/07/introducing-PR-drafting-in-reviews)
`;

export class ReviewDrafter extends BaseWebhookHandler {
  public allowedEventTypes = [
    EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    EventType.PULL_REQUEST_READY_FOR_REVIEW,
  ];
  public allowedRepositories = [HomeAssistantRepository.CORE];

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
      context.payload.review.state !== 'changes_requested' ||
      !['COLLABORATOR', 'MEMBER', 'OWNER'].includes(context.payload.review.author_association)
    ) {
      // If the PR is already a draft, we don't need to do anything
      // If the review is not a changes requested, we don't need to do anything
      // If the author is not a collaborator, member or owner, we don't need to do anything
      return;
    }

    // Mark PR as draft, this is not available in the REST API, so we need to use GraphQL
    await context.github.graphql({
      query: `mutation { convertPullRequestToDraft(input: {pullRequestId: "${context.payload.pull_request.node_id}"}) {clientMutationId}}`,
    });

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
    const reviewers = new Set(
      reviews
        .filter((review) => review.state === 'CHANGES_REQUESTED')
        .map((review) => review.user.login),
    );

    if (reviewers.size) {
      // Request review from all reviewers that have requested changes.
      await context.github.pulls.requestReviewers(
        context.pullRequest({ reviewers: Array.from(reviewers) }),
      );
    }
  }
}
