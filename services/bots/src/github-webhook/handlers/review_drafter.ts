import {
  PullRequestReadyForReviewEvent,
  PullRequestReviewSubmittedEvent,
} from '@octokit/webhooks-types';
import { EventType, Organization } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

const MESSAGE_ID = '<!-- ReviewDrafterComment -->';
const COPILOT_MESSAGE_ID = '<!-- ReviewDrafterCopilotComment -->';
const COPILOT_OUTDATED_MESSAGE_ID = '<!-- ReviewDrafterCopilotCommentOutdated -->';

const COPILOT_LOGINS = new Set(['copilot']);

// Author reactions that count as "I've acknowledged / agreed with this finding".
const ACKNOWLEDGMENT_REACTIONS = new Set(['+1', 'heart', 'hooray', 'rocket']);

const MORE_INFO_URL = {
  [Organization.ESPHOME]:
    'https://esphome.io/guides/contributing#prs-are-being-drafted-when-changes-are-needed',
  [Organization.HOME_ASSISTANT]:
    'https://developers.home-assistant.io/docs/review-process#prs-are-being-drafted-when-changes-are-needed',
};

const REVIEW_COMMENT = (organization: Organization) => `${MESSAGE_ID}
Please take a look at the requested changes, and use the **Ready for review** button when you are done, thanks :+1:

[_Learn more about our pull request process._](${MORE_INFO_URL[organization]})
`;

const COPILOT_REVIEW_COMMENT = (findingsCount: number, findingLinks: string[]) =>
  `${COPILOT_MESSAGE_ID}
Copilot left ${findingsCount} finding${
    findingsCount === 1 ? '' : 's'
  } that still need an author reply.

Please reply to each Copilot finding in-thread before marking this PR as **Ready for review**.

Open finding threads:
${findingLinks.map((link) => `- ${link}`).join('\n')}
`;

const COPILOT_OUTDATED_NOTICE = `${COPILOT_OUTDATED_MESSAGE_ID}
> [!NOTE]
> This Copilot review tracker is outdated.

`;

interface UnansweredFinding {
  id: number;
  url: string;
}

export class ReviewDrafter extends BaseWebhookHandler {
  public allowedEventTypes = [
    EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    EventType.PULL_REQUEST_READY_FOR_REVIEW,
  ];
  public allowedOrganizations = [Organization.HOME_ASSISTANT, Organization.ESPHOME];

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
    if (this.isCopilotReview(context)) {
      await this.handleCopilotReviewSubmitted(context);
      return;
    }

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

    const currentComments = await context.github.paginate(
      context.github.issues.listComments,
      context.issue({ per_page: 100 }),
    );
    if (!currentComments.find((comment) => comment.body?.startsWith(MESSAGE_ID))) {
      // No comment found, add one
      await context.github.issues.createComment(
        context.issue({
          body: REVIEW_COMMENT(context.organization),
        }),
      );
    }
  }

  async handleReadyForReview(context: WebhookContext<PullRequestReadyForReviewEvent>) {
    const unansweredCopilotFindings = await this.findUnansweredCopilotFindings(context);

    const currentComments = await context.github.paginate(
      context.github.issues.listComments,
      context.issue({ per_page: 100 }),
    );

    // Whenever the PR leaves draft, retire any active Copilot tracker so the
    // next round of findings (if any) starts with a fresh comment.
    await this.markCopilotCommentOutdated(context, currentComments);

    if (unansweredCopilotFindings.length) {
      // The @octokit/webhooks-types union for ready_for_review collapses pull_request to `never`,
      // so we cast through unknown to access node_id, which is always present at runtime.
      const pullRequest = context.payload.pull_request as unknown as { node_id: string };
      await context.convertPullRequestToDraft(pullRequest.node_id);
      // Post a fresh reminder rather than updating in place — the previous tracker is now outdated.
      await context.github.issues.createComment(
        context.issue({
          body: COPILOT_REVIEW_COMMENT(
            unansweredCopilotFindings.length,
            unansweredCopilotFindings.slice(0, 10).map((finding) => finding.url),
          ),
        }),
      );
      return;
    }

    if (!currentComments.find((comment) => comment.body?.startsWith(MESSAGE_ID))) {
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
      for (const reviewer of reviewers) {
        /*
          Loop over all reviewers and request them seperatly.
          If we do not do this and there is 1 reviewer in the list that does not have review permissions,
          the API call will fail.
        */
        try {
          await context.github.pulls.requestReviewers(
            context.pullRequest({ reviewers: [reviewer] }),
          );
        } catch {
          // Ignore non-member reviewer
        }
      }
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

  private isCopilotLogin(login: string | undefined | null): boolean {
    if (!login) {
      return false;
    }
    return COPILOT_LOGINS.has(login.toLowerCase());
  }

  private isCopilotReview(context: WebhookContext<PullRequestReviewSubmittedEvent>): boolean {
    return this.isCopilotLogin(context.payload.review.user?.login);
  }

  private async handleCopilotReviewSubmitted(
    context: WebhookContext<PullRequestReviewSubmittedEvent>,
  ): Promise<void> {
    const unansweredCopilotFindings = await this.findUnansweredCopilotFindings(context);

    if (!unansweredCopilotFindings.length) {
      return;
    }

    if (!context.payload.pull_request.draft) {
      await context.convertPullRequestToDraft(context.payload.pull_request.node_id);
    }

    await this.createOrUpdateCopilotComment(context, unansweredCopilotFindings);
  }

  private async findUnansweredCopilotFindings(
    context: WebhookContext<PullRequestReviewSubmittedEvent | PullRequestReadyForReviewEvent>,
  ): Promise<UnansweredFinding[]> {
    const reviewComments = await context.github.paginate(
      context.github.pulls.listReviewComments,
      context.pullRequest({ per_page: 100 }),
    );

    const authorLogin = context.payload.pull_request.user.login.toLowerCase();
    const copilotFindings = reviewComments.filter(
      (reviewComment) =>
        !reviewComment.in_reply_to_id && this.isCopilotLogin(reviewComment.user?.login),
    );

    if (!copilotFindings.length) {
      return [];
    }

    const authorReplies = new Set(
      reviewComments
        .filter(
          (reviewComment) =>
            reviewComment.in_reply_to_id &&
            reviewComment.user?.login?.toLowerCase() === authorLogin,
        )
        .map((reviewComment) => reviewComment.in_reply_to_id as number),
    );

    // The author can also acknowledge a finding with a positive reaction (e.g. :+1: on the
    // implementation). Negative or ambiguous reactions (-1, confused, eyes, laugh) are not
    // treated as acknowledgment.
    const findingHasAuthorReaction = await Promise.all(
      copilotFindings.map(async (finding) => {
        const reactions = await context.github.paginate(
          context.github.reactions.listForPullRequestReviewComment,
          context.repo({ comment_id: finding.id, per_page: 100 }),
        );
        return reactions.some(
          (reaction) =>
            reaction.user?.login?.toLowerCase() === authorLogin &&
            ACKNOWLEDGMENT_REACTIONS.has(reaction.content),
        );
      }),
    );

    return copilotFindings
      .filter((finding, idx) => !authorReplies.has(finding.id) && !findingHasAuthorReaction[idx])
      .map((finding) => ({ id: finding.id, url: finding.html_url }));
  }

  private async markCopilotCommentOutdated(
    context: WebhookContext<PullRequestReviewSubmittedEvent | PullRequestReadyForReviewEvent>,
    issueComments: Array<{ id: number; body?: string | null }>,
  ): Promise<void> {
    const activeComment = issueComments.find((comment) =>
      comment.body?.startsWith(COPILOT_MESSAGE_ID),
    );
    if (!activeComment) {
      return;
    }

    // Drop the active marker so subsequent lookups don't rediscover this comment,
    // and prepend an outdated banner.
    const remainingBody = (activeComment.body ?? '').replace(COPILOT_MESSAGE_ID, '').trimStart();
    const outdatedBody = `${COPILOT_OUTDATED_NOTICE}${remainingBody}`;

    await context.github.issues.updateComment(
      context.repo({ comment_id: activeComment.id, body: outdatedBody }),
    );
  }

  private async createOrUpdateCopilotComment(
    context: WebhookContext<PullRequestReviewSubmittedEvent | PullRequestReadyForReviewEvent>,
    unansweredCopilotFindings: UnansweredFinding[],
  ): Promise<void> {
    const currentComments = await context.github.paginate(
      context.github.issues.listComments,
      context.issue({ per_page: 100 }),
    );
    const existingComment = currentComments.find((comment) =>
      comment.body?.startsWith(COPILOT_MESSAGE_ID),
    );

    const body = COPILOT_REVIEW_COMMENT(
      unansweredCopilotFindings.length,
      unansweredCopilotFindings.slice(0, 10).map((finding) => finding.url),
    );

    if (existingComment) {
      await context.github.issues.updateComment(
        context.repo({
          comment_id: existingComment.id,
          body,
        }),
      );
      return;
    }

    await context.github.issues.createComment(
      context.issue({
        body,
      }),
    );
  }
}
