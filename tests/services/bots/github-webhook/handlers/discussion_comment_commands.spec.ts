import { DiscussionCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';
import { DiscussionCommentCommands } from '../../../../../services/bots/src/github-webhook/handlers/discussion_comment_commands/handler';
import { EventType } from '../../../../../services/bots/src/github-webhook/github-webhook.const';

const graphqlMock = (context: WebhookContext<DiscussionCommentCreatedEvent>) =>
  context.github.graphql as unknown as jest.Mock;

describe('DiscussionCommentCommands', () => {
  let handler: DiscussionCommentCommands;
  let mockContext: WebhookContext<DiscussionCommentCreatedEvent>;
  let mockedFetch: ReturnType<typeof jest.fn>;

  beforeEach(function () {
    mockedFetch = jest.fn(global.fetch);
    mockedFetch.mockImplementation(() =>
      Promise.resolve({
        json: () => Promise.resolve({ codeowners: ['@test'] }),
      } as unknown as Response),
    );
    (global.fetch as unknown) = mockedFetch;
    handler = new DiscussionCommentCommands();
    mockContext = mockWebhookContext<DiscussionCommentCreatedEvent>({
      eventType: EventType.DISCUSSION_COMMENT_CREATED,
      payload: loadJsonFixture<DiscussionCommentCreatedEvent>('discussion_comment.created'),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('command: close', () => {
    it('by codeowner defaults to RESOLVED', async () => {
      mockContext.payload.comment.body = '@home-assistant close';
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(graphqlMock(mockContext)).toHaveBeenCalledWith(
        expect.stringContaining('closeDiscussion'),
        expect.objectContaining({ id: 'D_discussion_972', reason: 'RESOLVED' }),
      );
      expect(graphqlMock(mockContext)).toHaveBeenCalledWith(
        expect.stringContaining('addReaction'),
        expect.objectContaining({ content: 'THUMBS_UP' }),
      );
    });

    it('by codeowner with a reason', async () => {
      mockContext.payload.comment.body = '@home-assistant close duplicate';
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(graphqlMock(mockContext)).toHaveBeenCalledWith(
        expect.stringContaining('closeDiscussion'),
        expect.objectContaining({ reason: 'DUPLICATE' }),
      );
    });

    it('rejects an unknown reason', async () => {
      mockContext.payload.comment.body = '@home-assistant close foo';
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(graphqlMock(mockContext)).not.toHaveBeenCalledWith(
        expect.stringContaining('closeDiscussion'),
        expect.anything(),
      );
      expect(graphqlMock(mockContext)).toHaveBeenCalledWith(
        expect.stringContaining('addReaction'),
        expect.objectContaining({ content: 'THUMBS_DOWN' }),
      );
    });

    it('not by codeowner', async () => {
      mockContext.payload.comment.body = '@home-assistant close';
      mockContext.payload.comment.user.login = 'other';
      await handler.handle(mockContext);

      expect(graphqlMock(mockContext)).not.toHaveBeenCalledWith(
        expect.stringContaining('closeDiscussion'),
        expect.anything(),
      );
      expect(graphqlMock(mockContext)).toHaveBeenCalledWith(
        expect.stringContaining('addReaction'),
        expect.objectContaining({ content: 'THUMBS_DOWN' }),
      );
    });

    it('not on a discussion without an integration label', async () => {
      mockContext.payload.comment.body = '@home-assistant close';
      mockContext.payload.comment.user.login = 'test';
      (mockContext.payload.discussion as { labels?: unknown[] }).labels = [];
      await handler.handle(mockContext);

      expect(graphqlMock(mockContext)).not.toHaveBeenCalledWith(
        expect.stringContaining('closeDiscussion'),
        expect.anything(),
      );
    });
  });

  describe('command: reopen', () => {
    it('by codeowner', async () => {
      mockContext.payload.comment.body = '@home-assistant reopen';
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(graphqlMock(mockContext)).toHaveBeenCalledWith(
        expect.stringContaining('reopenDiscussion'),
        expect.objectContaining({ id: 'D_discussion_972' }),
      );
    });
  });

  describe('command: answer', () => {
    it('replies with guidance and does not mark when used top-level', async () => {
      mockContext.payload.comment.body = '@home-assistant answer';
      mockContext.payload.comment.user.login = 'test';
      mockContext.payload.comment.parent_id = null;
      await handler.handle(mockContext);

      expect(graphqlMock(mockContext)).toHaveBeenCalledWith(
        expect.stringContaining('addDiscussionComment'),
        expect.objectContaining({ replyToId: 'DC_comment_555' }),
      );
      expect(graphqlMock(mockContext)).not.toHaveBeenCalledWith(
        expect.stringContaining('markDiscussionCommentAsAnswer'),
        expect.anything(),
      );
    });

    it('marks the parent comment when it is a reply', async () => {
      mockContext.payload.comment.body = '@home-assistant answer';
      mockContext.payload.comment.user.login = 'test';
      mockContext.payload.comment.parent_id = 7;
      graphqlMock(mockContext).mockImplementation((query: string) =>
        Promise.resolve(
          query.includes('pageInfo')
            ? {
                repository: {
                  discussion: {
                    comments: {
                      pageInfo: { hasNextPage: false, endCursor: null },
                      nodes: [{ id: 'PARENT_NODE', databaseId: 7 }],
                    },
                  },
                },
              }
            : {},
        ),
      );
      await handler.handle(mockContext);

      expect(graphqlMock(mockContext)).toHaveBeenCalledWith(
        expect.stringContaining('markDiscussionCommentAsAnswer'),
        expect.objectContaining({ id: 'PARENT_NODE' }),
      );
    });

    it('does nothing in a non-answerable category', async () => {
      mockContext.payload.comment.body = '@home-assistant answer';
      mockContext.payload.comment.user.login = 'test';
      mockContext.payload.discussion.category.is_answerable = false;
      await handler.handle(mockContext);

      expect(graphqlMock(mockContext)).not.toHaveBeenCalledWith(
        expect.stringContaining('markDiscussionCommentAsAnswer'),
        expect.anything(),
      );
    });
  });

  describe('command: rename', () => {
    it('by codeowner with a title', async () => {
      mockContext.payload.comment.body = '@home-assistant rename New title';
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(graphqlMock(mockContext)).toHaveBeenCalledWith(
        expect.stringContaining('updateDiscussion'),
        expect.objectContaining({ title: 'New title' }),
      );
    });

    it('without a title', async () => {
      mockContext.payload.comment.body = '@home-assistant rename';
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(graphqlMock(mockContext)).not.toHaveBeenCalledWith(
        expect.stringContaining('updateDiscussion'),
        expect.anything(),
      );
    });
  });
});
