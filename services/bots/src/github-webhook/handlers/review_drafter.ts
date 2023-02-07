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
For more information about this flow [take a look at this blog post](replace_with_blog_post_when_it_exist).
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
      context.payload.review.state !== 'changes_requested'
    ) {
      // We only care about changes_requested on non-draft PRs
      return;
    }
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

    // Mark PR as draft, this is not available in the REST API, so we need to use GraphQL
    await context.github.graphql({
      query: `mutation { convertPullRequestToDraft(input: {pullRequestId: "${context.payload.pull_request.node_id}"}) {}}`,
    });
  }

  async handleReadyForReview(context: WebhookContext<PullRequestReadyForReviewEvent>) {
    const currentComments = await context.github.issues.listComments(
      context.issue({ per_page: 100 }),
    );
    if (!currentComments.data.find((comment) => comment.body.startsWith(MESSAGE_ID))) {
      // We did not add the comment, so we should not request a review
      return;
    }

    const { data: currentRewiewers } = await context.github.pulls.listRequestedReviewers(
      context.pullRequest(),
    );
    // Request review from all users and teams that are currently requested
    await context.github.pulls.requestReviewers(
      context.pullRequest({
        reviewers: currentRewiewers.users.map((user) => user.login),
        team_reviewers: currentRewiewers.teams.map((team) => team.slug),
      }),
    );
  }
}
