// @ts-nocheck
import {
  PullRequestReadyForReviewEvent,
  PullRequestReviewSubmittedEvent,
} from '@octokit/webhooks-types';
import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import {
  EventType,
  HomeAssistantRepository,
} from '../../../../../services/bots/src/github-webhook/github-webhook.const';
import { ReviewDrafter } from '../../../../../services/bots/src/github-webhook/handlers/review_drafter';
import { loadJsonFixture } from '../../../../utils/fixture';
import { mockWebhookContext } from '../../../../utils/test_context';

describe('ReviewDrafter', () => {
  const copilotLogin = 'copilot-pull-request-reviewer[bot]';
  const authorLogin = 'Codertocat';

  let handler: ReviewDrafter;

  beforeEach(() => {
    handler = new ReviewDrafter();
  });

  const basePayload = (eventType: EventType, overrides: Record<string, any> = {}) =>
    loadJsonFixture<any>('pull_request.opened', {
      action: eventType.split('.')[1],
      repository: {
        name: 'core',
        full_name: HomeAssistantRepository.CORE,
        owner: { login: 'home-assistant' },
      },
      sender: {
        login: copilotLogin,
        type: 'Bot',
      },
      pull_request: {
        draft: false,
        node_id: 'PR_NODE_ID',
        user: { login: authorLogin },
        ...overrides.pull_request,
      },
      ...overrides,
    });

  // Default reaction stubs: empty unless a test overrides the per-comment data.
  const reactionsByComment = (
    overrides: Record<number, Array<{ user: { login: string }; content: string }>> = {},
  ) =>
    jest.fn().mockImplementation(({ comment_id }) =>
      Promise.resolve({ data: overrides[comment_id] ?? [] }),
    );

  describe('Copilot review submitted', () => {
    it('drafts PR when Copilot leaves unanswered findings in a submitted review', async () => {
      const context = mockWebhookContext<PullRequestReviewSubmittedEvent>({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        payload: {
          ...basePayload(EventType.PULL_REQUEST_REVIEW_SUBMITTED),
          review: {
            id: 10,
            state: 'commented',
            user: { login: copilotLogin, type: 'Bot' },
          },
        } as any,
        github: {
          pulls: {
            listReviewComments: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 101,
                  in_reply_to_id: null,
                  user: { login: copilotLogin },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r101',
                },
              ],
            }),
          },
          reactions: {
            listForPullRequestReviewComment: reactionsByComment(),
          },
          issues: {
            listComments: jest.fn().mockResolvedValue({ data: [] }),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      });

      (context as any).convertPullRequestToDraft = jest.fn();

      await handler.handle(context as WebhookContext<PullRequestReviewSubmittedEvent>);

      expect((context as any).convertPullRequestToDraft).toHaveBeenCalledWith('PR_NODE_ID');
      expect(context.github.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Copilot left 1 finding'),
        }),
      );
      expect(context.github.issues.updateComment).not.toHaveBeenCalled();
    });

    it('does not draft PR when all Copilot findings have an author reply', async () => {
      const context = mockWebhookContext<PullRequestReviewSubmittedEvent>({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        payload: {
          ...basePayload(EventType.PULL_REQUEST_REVIEW_SUBMITTED),
          review: {
            id: 10,
            state: 'commented',
            user: { login: copilotLogin, type: 'Bot' },
          },
        } as any,
        github: {
          pulls: {
            listReviewComments: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 101,
                  in_reply_to_id: null,
                  user: { login: copilotLogin },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r101',
                },
                {
                  id: 102,
                  in_reply_to_id: 101,
                  user: { login: authorLogin },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r102',
                },
              ],
            }),
          },
          reactions: {
            listForPullRequestReviewComment: reactionsByComment(),
          },
          issues: {
            listComments: jest.fn().mockResolvedValue({ data: [] }),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      });

      (context as any).convertPullRequestToDraft = jest.fn();

      await handler.handle(context as WebhookContext<PullRequestReviewSubmittedEvent>);

      expect((context as any).convertPullRequestToDraft).not.toHaveBeenCalled();
      expect(context.github.issues.createComment).not.toHaveBeenCalled();
      expect(context.github.issues.updateComment).not.toHaveBeenCalled();
    });

    it('treats an author thumbs-up reaction on a Copilot finding as resolved', async () => {
      const context = mockWebhookContext<PullRequestReviewSubmittedEvent>({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        payload: {
          ...basePayload(EventType.PULL_REQUEST_REVIEW_SUBMITTED),
          review: {
            id: 10,
            state: 'commented',
            user: { login: copilotLogin, type: 'Bot' },
          },
        } as any,
        github: {
          pulls: {
            listReviewComments: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 101,
                  in_reply_to_id: null,
                  user: { login: copilotLogin },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r101',
                },
              ],
            }),
          },
          reactions: {
            listForPullRequestReviewComment: reactionsByComment({
              101: [{ user: { login: authorLogin }, content: '+1' }],
            }),
          },
          issues: {
            listComments: jest.fn().mockResolvedValue({ data: [] }),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      });

      (context as any).convertPullRequestToDraft = jest.fn();

      await handler.handle(context as WebhookContext<PullRequestReviewSubmittedEvent>);

      expect((context as any).convertPullRequestToDraft).not.toHaveBeenCalled();
      expect(context.github.issues.createComment).not.toHaveBeenCalled();
      expect(context.github.issues.updateComment).not.toHaveBeenCalled();
    });

    it('ignores reactions from non-author users', async () => {
      const context = mockWebhookContext<PullRequestReviewSubmittedEvent>({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        payload: {
          ...basePayload(EventType.PULL_REQUEST_REVIEW_SUBMITTED),
          review: {
            id: 10,
            state: 'commented',
            user: { login: copilotLogin, type: 'Bot' },
          },
        } as any,
        github: {
          pulls: {
            listReviewComments: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 101,
                  in_reply_to_id: null,
                  user: { login: copilotLogin },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r101',
                },
              ],
            }),
          },
          reactions: {
            listForPullRequestReviewComment: reactionsByComment({
              101: [{ user: { login: 'someone-else' }, content: '+1' }],
            }),
          },
          issues: {
            listComments: jest.fn().mockResolvedValue({ data: [] }),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      });

      (context as any).convertPullRequestToDraft = jest.fn();

      await handler.handle(context as WebhookContext<PullRequestReviewSubmittedEvent>);

      expect((context as any).convertPullRequestToDraft).toHaveBeenCalledWith('PR_NODE_ID');
      expect(context.github.issues.createComment).toHaveBeenCalled();
    });

    it('does not consider a non-author reply as resolving a Copilot finding', async () => {
      const context = mockWebhookContext<PullRequestReviewSubmittedEvent>({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        payload: {
          ...basePayload(EventType.PULL_REQUEST_REVIEW_SUBMITTED),
          review: {
            id: 10,
            state: 'commented',
            user: { login: copilotLogin, type: 'Bot' },
          },
        } as any,
        github: {
          pulls: {
            listReviewComments: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 101,
                  in_reply_to_id: null,
                  user: { login: copilotLogin },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r101',
                },
                {
                  id: 102,
                  in_reply_to_id: 101,
                  user: { login: 'someone-else' },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r102',
                },
              ],
            }),
          },
          reactions: {
            listForPullRequestReviewComment: reactionsByComment(),
          },
          issues: {
            listComments: jest.fn().mockResolvedValue({ data: [] }),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      });

      (context as any).convertPullRequestToDraft = jest.fn();

      await handler.handle(context as WebhookContext<PullRequestReviewSubmittedEvent>);

      expect((context as any).convertPullRequestToDraft).toHaveBeenCalledWith('PR_NODE_ID');
      expect(context.github.issues.createComment).toHaveBeenCalled();
    });

    it('updates the existing Copilot tracker comment instead of creating a duplicate (draft phase)', async () => {
      const context = mockWebhookContext<PullRequestReviewSubmittedEvent>({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        payload: {
          ...basePayload(EventType.PULL_REQUEST_REVIEW_SUBMITTED, {
            pull_request: { draft: true },
          }),
          review: {
            id: 11,
            state: 'commented',
            user: { login: copilotLogin, type: 'Bot' },
          },
        } as any,
        github: {
          pulls: {
            listReviewComments: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 201,
                  in_reply_to_id: null,
                  user: { login: copilotLogin },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r201',
                },
                {
                  id: 202,
                  in_reply_to_id: null,
                  user: { login: copilotLogin },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r202',
                },
              ],
            }),
          },
          reactions: {
            listForPullRequestReviewComment: reactionsByComment(),
          },
          issues: {
            listComments: jest.fn().mockResolvedValue({
              data: [{ id: 999, body: '<!-- ReviewDrafterCopilotComment -->\nold body' }],
            }),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      });

      (context as any).convertPullRequestToDraft = jest.fn();

      await handler.handle(context as WebhookContext<PullRequestReviewSubmittedEvent>);

      expect(context.github.issues.createComment).not.toHaveBeenCalled();
      expect(context.github.issues.updateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          comment_id: 999,
          body: expect.stringContaining('Copilot left 2 findings'),
        }),
      );
    });

    it('does not convert to draft when PR is already a draft, but still posts the tracker comment', async () => {
      const context = mockWebhookContext<PullRequestReviewSubmittedEvent>({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        payload: {
          ...basePayload(EventType.PULL_REQUEST_REVIEW_SUBMITTED, {
            pull_request: { draft: true },
          }),
          review: {
            id: 12,
            state: 'commented',
            user: { login: copilotLogin, type: 'Bot' },
          },
        } as any,
        github: {
          pulls: {
            listReviewComments: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 301,
                  in_reply_to_id: null,
                  user: { login: copilotLogin },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r301',
                },
              ],
            }),
          },
          reactions: {
            listForPullRequestReviewComment: reactionsByComment(),
          },
          issues: {
            listComments: jest.fn().mockResolvedValue({ data: [] }),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      });

      (context as any).convertPullRequestToDraft = jest.fn();

      await handler.handle(context as WebhookContext<PullRequestReviewSubmittedEvent>);

      expect((context as any).convertPullRequestToDraft).not.toHaveBeenCalled();
      expect(context.github.issues.createComment).toHaveBeenCalled();
    });

    it('recognizes the bare "Copilot" login (AI agent without [bot] suffix)', async () => {
      const bareCopilot = 'Copilot';
      const context = mockWebhookContext<PullRequestReviewSubmittedEvent>({
        eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        payload: {
          ...basePayload(EventType.PULL_REQUEST_REVIEW_SUBMITTED),
          review: {
            id: 14,
            state: 'commented',
            user: { login: bareCopilot, type: 'Bot' },
          },
        } as any,
        github: {
          pulls: {
            listReviewComments: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 601,
                  in_reply_to_id: null,
                  user: { login: bareCopilot },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r601',
                },
              ],
            }),
          },
          reactions: {
            listForPullRequestReviewComment: reactionsByComment(),
          },
          issues: {
            listComments: jest.fn().mockResolvedValue({ data: [] }),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      });

      (context as any).convertPullRequestToDraft = jest.fn();

      await handler.handle(context as WebhookContext<PullRequestReviewSubmittedEvent>);

      expect((context as any).convertPullRequestToDraft).toHaveBeenCalledWith('PR_NODE_ID');
      expect(context.github.issues.createComment).toHaveBeenCalled();
    });

    it.each(['mycopilot', 'copilot-fan', 'copilotuser'])(
      'treats "%s" (login containing "copilot" without [bot] and not exact match) as a regular user',
      async (fakeCopilot) => {
        const context = mockWebhookContext<PullRequestReviewSubmittedEvent>({
          eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
          payload: {
            ...basePayload(EventType.PULL_REQUEST_REVIEW_SUBMITTED),
            review: {
              id: 13,
              state: 'commented',
              user: { login: fakeCopilot, type: 'User' },
            },
            sender: { login: fakeCopilot, type: 'User' },
          } as any,
          github: {
            pulls: {
              listReviewComments: jest.fn(),
            },
            issues: {
              listComments: jest.fn(),
              createComment: jest.fn(),
              updateComment: jest.fn(),
            },
          },
        });

        (context as any).convertPullRequestToDraft = jest.fn();

        await handler.handle(context as WebhookContext<PullRequestReviewSubmittedEvent>);

        expect(context.github.pulls.listReviewComments).not.toHaveBeenCalled();
        expect((context as any).convertPullRequestToDraft).not.toHaveBeenCalled();
      },
    );
  });

  describe('Ready for review', () => {
    it('marks the active Copilot tracker outdated and posts a fresh reminder when findings are still unanswered', async () => {
      const context = mockWebhookContext<PullRequestReadyForReviewEvent>({
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        payload: {
          ...basePayload(EventType.PULL_REQUEST_READY_FOR_REVIEW),
          sender: { login: authorLogin, type: 'User' },
        } as any,
        github: {
          pulls: {
            listReviewComments: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 401,
                  in_reply_to_id: null,
                  user: { login: copilotLogin },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r401',
                },
              ],
            }),
            listReviews: jest.fn(),
            requestReviewers: jest.fn(),
            dismissReview: jest.fn(),
          },
          reactions: {
            listForPullRequestReviewComment: reactionsByComment(),
          },
          issues: {
            listComments: jest.fn().mockResolvedValue({
              data: [{ id: 555, body: '<!-- ReviewDrafterCopilotComment -->\nprevious body' }],
            }),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      });

      (context as any).convertPullRequestToDraft = jest.fn();

      await handler.handle(context as WebhookContext<PullRequestReadyForReviewEvent>);

      expect((context as any).convertPullRequestToDraft).toHaveBeenCalledWith('PR_NODE_ID');
      expect(context.github.pulls.listReviews).not.toHaveBeenCalled();

      // Old tracker is marked outdated.
      expect(context.github.issues.updateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          comment_id: 555,
          body: expect.stringContaining('<!-- ReviewDrafterCopilotCommentOutdated -->'),
        }),
      );
      expect(context.github.issues.updateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('This Copilot review tracker is outdated'),
        }),
      );

      // A fresh reminder is created (not an update).
      expect(context.github.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Copilot left 1 finding'),
        }),
      );
    });

    it('still drafts and reminds when no prior tracker exists', async () => {
      const context = mockWebhookContext<PullRequestReadyForReviewEvent>({
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        payload: {
          ...basePayload(EventType.PULL_REQUEST_READY_FOR_REVIEW),
          sender: { login: authorLogin, type: 'User' },
        } as any,
        github: {
          pulls: {
            listReviewComments: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 411,
                  in_reply_to_id: null,
                  user: { login: copilotLogin },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r411',
                },
              ],
            }),
            listReviews: jest.fn(),
            requestReviewers: jest.fn(),
            dismissReview: jest.fn(),
          },
          reactions: {
            listForPullRequestReviewComment: reactionsByComment(),
          },
          issues: {
            listComments: jest.fn().mockResolvedValue({ data: [] }),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      });

      (context as any).convertPullRequestToDraft = jest.fn();

      await handler.handle(context as WebhookContext<PullRequestReadyForReviewEvent>);

      expect((context as any).convertPullRequestToDraft).toHaveBeenCalledWith('PR_NODE_ID');
      expect(context.github.issues.updateComment).not.toHaveBeenCalled();
      expect(context.github.issues.createComment).toHaveBeenCalled();
    });

    it('marks the active Copilot tracker outdated when all findings are handled and proceeds with normal flow', async () => {
      const context = mockWebhookContext<PullRequestReadyForReviewEvent>({
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        payload: {
          ...basePayload(EventType.PULL_REQUEST_READY_FOR_REVIEW),
          sender: { login: authorLogin, type: 'User' },
        } as any,
        github: {
          pulls: {
            listReviewComments: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 421,
                  in_reply_to_id: null,
                  user: { login: copilotLogin },
                  html_url: 'https://github.com/home-assistant/core/pull/1#discussion_r421',
                },
              ],
            }),
            listReviews: jest.fn().mockResolvedValue({ data: [] }),
            requestReviewers: jest.fn(),
            dismissReview: jest.fn(),
          },
          reactions: {
            listForPullRequestReviewComment: reactionsByComment({
              421: [{ user: { login: authorLogin }, content: '+1' }],
            }),
          },
          issues: {
            listComments: jest.fn().mockResolvedValue({
              data: [
                { id: 1, body: '<!-- ReviewDrafterComment --> message' },
                { id: 777, body: '<!-- ReviewDrafterCopilotComment -->\nprevious body' },
              ],
            }),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      });

      (context as any).convertPullRequestToDraft = jest.fn();

      await handler.handle(context as WebhookContext<PullRequestReadyForReviewEvent>);

      expect((context as any).convertPullRequestToDraft).not.toHaveBeenCalled();

      // Old Copilot tracker marked outdated.
      expect(context.github.issues.updateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          comment_id: 777,
          body: expect.stringContaining('<!-- ReviewDrafterCopilotCommentOutdated -->'),
        }),
      );
      // Did NOT post a new Copilot reminder.
      expect(context.github.issues.createComment).not.toHaveBeenCalled();

      // Normal ready_for_review flow still ran.
      expect(context.github.pulls.listReviews).toHaveBeenCalled();
    });

    it('keeps existing ready_for_review behavior when there are no Copilot findings at all', async () => {
      const context = mockWebhookContext<PullRequestReadyForReviewEvent>({
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        payload: {
          ...basePayload(EventType.PULL_REQUEST_READY_FOR_REVIEW),
          sender: { login: authorLogin, type: 'User' },
        } as any,
        github: {
          pulls: {
            listReviewComments: jest.fn().mockResolvedValue({ data: [] }),
            listReviews: jest.fn().mockResolvedValue({
              data: [
                { id: 501, state: 'CHANGES_REQUESTED', user: { login: 'reviewer', type: 'User' } },
                { id: 502, state: 'CHANGES_REQUESTED', user: { login: 'helper[bot]', type: 'Bot' } },
              ],
            }),
            requestReviewers: jest.fn(),
            dismissReview: jest.fn(),
          },
          issues: {
            listComments: jest.fn().mockResolvedValue({
              data: [{ id: 1, body: '<!-- ReviewDrafterComment --> message' }],
            }),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      });

      (context as any).convertPullRequestToDraft = jest.fn();

      await handler.handle(context as WebhookContext<PullRequestReadyForReviewEvent>);

      expect((context as any).convertPullRequestToDraft).not.toHaveBeenCalled();
      expect(context.github.issues.updateComment).not.toHaveBeenCalled();
      expect(context.github.pulls.requestReviewers).toHaveBeenCalledWith(
        expect.objectContaining({ reviewers: ['reviewer'] }),
      );
      expect(context.github.pulls.dismissReview).toHaveBeenCalledWith(
        expect.objectContaining({ review_id: 502 }),
      );
    });
  });
});
