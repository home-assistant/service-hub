import fetch from 'node-fetch';

import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';
import { IssueCommentCommands } from '../../../../../services/bots/src/github-webhook/handlers/issue_comment_commands/handler';
import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { EventType } from '../../../../../services/bots/src/github-webhook/github-webhook.const';

// Globally mock fetch
jest.mock('node-fetch', () => jest.fn());
fetch.mockImplementation(() =>
  Promise.resolve({ json: () => Promise.resolve({ codeowners: ['@test'] }) }),
);

describe('IssueCommentCommands', () => {
  let handler: IssueCommentCommands;
  let mockContext: WebhookContext<IssueCommentCreatedEvent>;

  beforeEach(function () {
    handler = new IssueCommentCommands();
    mockContext = mockWebhookContext<IssueCommentCreatedEvent>({
      eventType: EventType.ISSUE_COMMENT_CREATED,
      payload: loadJsonFixture<IssueCommentCreatedEvent>('issue_comment.created', {
        //@ts-ignore
        issue: {
          assignees: [
            //@ts-ignore
            { login: 'test' },
          ],
          labels: [
            //@ts-ignore
            { name: 'integration: awesome' },
          ],
        },
      }),
    });
  });

  describe('command: close', () => {
    beforeEach(function () {
      mockContext.payload.comment.body = '@home-assistant close';
    });

    it('by codeowner', async () => {
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '+1' }),
      );
      expect(mockContext.github.issues.update).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'closed' }),
      );
    });
    it('not by codeowner', async () => {
      fetch.mockImplementation(() =>
        Promise.resolve({ json: () => Promise.resolve({ codeowners: ['@test'] }) }),
      );
      mockContext.payload.comment.user.login = 'other';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.update).not.toHaveBeenCalled();
    });
  });

  describe('command: rename', () => {
    it('by codeowner with title', async () => {
      mockContext.payload.comment.body = '@home-assistant rename New Title';
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '+1' }),
      );
      expect(mockContext.github.issues.update).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New Title' }),
      );
    });
    it('by codeowner without title', async () => {
      mockContext.payload.comment.body = '@home-assistant rename';
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.update).not.toHaveBeenCalled();
    });
    it('not by codeowner with title', async () => {
      mockContext.payload.comment.body = '@home-assistant rename  New Titl';
      mockContext.payload.comment.user.login = 'other';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.update).not.toHaveBeenCalled();
    });
  });

  describe('command: unassign', () => {
    it('by codeowner with domain', async () => {
      mockContext.payload.comment.body = '@home-assistant unassign awesome';
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '+1' }),
      );
      expect(mockContext.github.issues.removeLabel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'integration: awesome' }),
      );
      expect(mockContext.github.issues.removeAssignees).toHaveBeenCalledWith(
        expect.objectContaining({ assignees: ['test'] }),
      );
    });
    it('not by codeowner with domain', async () => {
      mockContext.payload.comment.body = '@home-assistant unassign awesome';
      mockContext.payload.comment.user.login = 'other';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.removeLabel).not.toHaveBeenCalled();
      expect(mockContext.github.issues.removeAssignees).not.toHaveBeenCalled();
    });
    it('by codeowner without domain', async () => {
      mockContext.payload.comment.body = '@home-assistant unassign';
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.removeLabel).not.toHaveBeenCalled();
      expect(mockContext.github.issues.removeAssignees).not.toHaveBeenCalled();
    });
    it('not by codeowner without domain', async () => {
      mockContext.payload.comment.body = '@home-assistant unassign';
      mockContext.payload.comment.user.login = 'other';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.removeLabel).not.toHaveBeenCalled();
      expect(mockContext.github.issues.removeAssignees).not.toHaveBeenCalled();
    });

    it('by codeowner with domain (when there are multiple domains)', async () => {
      mockContext.payload.comment.body = '@home-assistant unassign awesome';
      mockContext.payload.comment.user.login = 'test';
      mockContext.payload.issue.labels = [
        //@ts-ignore
        { name: 'integration: also_awesome' },
        //@ts-ignore
        { name: 'integration: awesome' },
      ];
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '+1' }),
      );
      expect(mockContext.github.issues.removeLabel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'integration: awesome' }),
      );
      expect(mockContext.github.issues.removeLabel).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'integration: also_awesome' }),
      );
    });
  });
});
