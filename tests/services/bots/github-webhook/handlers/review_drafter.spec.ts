// @ts-nocheck
import { EventType } from '../../../../../services/bots/src/github-webhook/github-webhook.const';
import { ReviewDrafter } from '../../../../../services/bots/src/github-webhook/handlers/review_drafter';
import { loadJsonFixture } from '../../../../utils/fixture';
import { mockWebhookContext } from '../../../../utils/test_context';

const MESSAGE_ID = '<!-- ReviewDrafterComment -->';

describe('ReviewDrafter', () => {
  let handler: ReviewDrafter;

  beforeEach(() => {
    handler = new ReviewDrafter();
  });

  const reviewSubmittedContext = ({
    draft = false,
    state = 'changes_requested',
    sender = { login: 'home-assistant[bot]', type: 'Bot' },
    comments = [],
  } = {}) =>
    mockWebhookContext({
      eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
      payload: loadJsonFixture('pull_request.opened', {
        action: 'submitted',
        repository: { owner: { login: 'home-assistant' } },
        sender,
        pull_request: { draft },
        review: { id: 1, state, user: sender },
      }),
      github: {
        orgs: {
          getMembershipForUser: jest.fn().mockResolvedValue({ data: { role: 'member' } }),
        },
        issues: {
          listComments: jest.fn().mockResolvedValue({ data: comments }),
        },
      },
    });

  const readyForReviewContext = ({ comments = [], reviews = [] } = {}) =>
    mockWebhookContext({
      eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
      payload: loadJsonFixture('pull_request.opened', {
        action: 'ready_for_review',
        repository: { owner: { login: 'home-assistant' } },
      }),
      github: {
        issues: {
          listComments: jest.fn().mockResolvedValue({ data: comments }),
        },
        pulls: {
          listReviews: jest.fn().mockResolvedValue({ data: reviews }),
          requestReviewers: jest.fn(),
          dismissReview: jest.fn(),
        },
      },
    });

  describe('review submitted', () => {
    it('drafts the PR and comments when changes are requested', async () => {
      const context = reviewSubmittedContext();

      await handler.handle(context);

      expect(context.github.graphql).toHaveBeenCalledTimes(1);
      expect(context.github.issues.createComment).toHaveBeenCalledTimes(1);
      expect(context.github.issues.createComment.mock.calls[0][0].body).toContain(MESSAGE_ID);
    });

    it('comments without drafting when the PR is already a draft', async () => {
      const context = reviewSubmittedContext({ draft: true });

      await handler.handle(context);

      expect(context.github.graphql).not.toHaveBeenCalled();
      expect(context.github.issues.createComment).toHaveBeenCalledTimes(1);
      expect(context.github.issues.createComment.mock.calls[0][0].body).toContain(MESSAGE_ID);
    });

    it('does not comment twice', async () => {
      const context = reviewSubmittedContext({ comments: [{ body: `${MESSAGE_ID}\nPlease` }] });

      await handler.handle(context);

      expect(context.github.graphql).toHaveBeenCalledTimes(1);
      expect(context.github.issues.createComment).not.toHaveBeenCalled();
    });

    it('ignores reviews that do not request changes', async () => {
      const context = reviewSubmittedContext({ state: 'approved' });

      await handler.handle(context);

      expect(context.github.graphql).not.toHaveBeenCalled();
      expect(context.github.issues.createComment).not.toHaveBeenCalled();
    });

    it('ignores changes requested by non-members', async () => {
      const context = reviewSubmittedContext({ sender: { login: 'someone', type: 'User' } });
      context.github.orgs.getMembershipForUser.mockRejectedValue(new Error('Not Found'));

      await handler.handle(context);

      expect(context.github.graphql).not.toHaveBeenCalled();
      expect(context.github.issues.createComment).not.toHaveBeenCalled();
    });
  });

  describe('ready for review', () => {
    const reviews = [
      { id: 1, state: 'CHANGES_REQUESTED', user: { login: 'home-assistant[bot]', type: 'Bot' } },
      { id: 2, state: 'CHANGES_REQUESTED', user: { login: 'reviewer', type: 'User' } },
      { id: 3, state: 'COMMENTED', user: { login: 'commenter', type: 'User' } },
    ];

    it('re-requests reviewers and dismisses bot reviews when the PR has our comment', async () => {
      const context = readyForReviewContext({
        comments: [{ body: `${MESSAGE_ID}\nPlease` }],
        reviews,
      });

      await handler.handle(context);

      expect(context.github.pulls.requestReviewers).toHaveBeenCalledTimes(1);
      expect(context.github.pulls.requestReviewers.mock.calls[0][0].reviewers).toEqual([
        'reviewer',
      ]);
      expect(context.github.pulls.dismissReview).toHaveBeenCalledTimes(1);
      expect(context.github.pulls.dismissReview.mock.calls[0][0].review_id).toBe(1);
    });

    it('only dismisses bot reviews when the PR does not have our comment', async () => {
      const context = readyForReviewContext({ reviews });

      await handler.handle(context);

      expect(context.github.pulls.requestReviewers).not.toHaveBeenCalled();
      expect(context.github.pulls.dismissReview).toHaveBeenCalledTimes(1);
      expect(context.github.pulls.dismissReview.mock.calls[0][0].review_id).toBe(1);
    });
  });
});
