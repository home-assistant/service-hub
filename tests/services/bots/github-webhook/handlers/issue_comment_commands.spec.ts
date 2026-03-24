import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';
import { IssueCommentCommands } from '../../../../../services/bots/src/github-webhook/handlers/issue_comment_commands/handler';
import { IssueCommentCreatedEvent, Label } from '@octokit/webhooks-types';
import {
  EventType,
  HomeAssistantRepository,
} from '../../../../../services/bots/src/github-webhook/github-webhook.const';

const mockedLabel = (name: string) => ({ name } as unknown as Label);

describe('IssueCommentCommands', () => {
  let handler: IssueCommentCommands;
  let mockContext: WebhookContext<IssueCommentCreatedEvent>;
  let mockedFetch: ReturnType<typeof jest.fn>;

  beforeEach(function () {
    mockedFetch = jest.fn(global.fetch);
    mockedFetch.mockImplementation(() =>
      Promise.resolve({
        json: () => Promise.resolve({ codeowners: ['@test'] }),
      } as unknown as Response),
    );
    (global.fetch as unknown) = mockedFetch;
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
          labels: [mockedLabel('integration: awesome')],
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
      mockedFetch.mockImplementation(() =>
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

  describe('command: add-label', () => {
    it('by codeowner with valid label', async () => {
      mockContext.payload.comment.body = '@home-assistant add-label needs-more-information';
      mockContext.payload.comment.user.login = 'test';
      mockContext.repository = HomeAssistantRepository.CORE;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '+1' }),
      );
      expect(mockContext.github.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ['needs-more-information'] }),
      );
    });
    it('not by codeowner with valid label', async () => {
      mockContext.payload.comment.body = '@home-assistant add-label needs-more-information';
      mockContext.payload.comment.user.login = 'other';
      mockContext.repository = HomeAssistantRepository.CORE;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.addLabels).not.toHaveBeenCalled();
    });
    it('by codeowner without label', async () => {
      mockContext.payload.comment.body = '@home-assistant add-label';
      mockContext.payload.comment.user.login = 'test';
      mockContext.repository = HomeAssistantRepository.CORE;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.addLabels).not.toHaveBeenCalled();
    });
    it('not by codeowner without label', async () => {
      mockContext.payload.comment.body = '@home-assistant add-label';
      mockContext.payload.comment.user.login = 'other';
      mockContext.repository = HomeAssistantRepository.CORE;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.addLabels).not.toHaveBeenCalled();
    });
  });

  describe('command: remove-label', () => {
    it('by codeowner with valid label', async () => {
      mockContext.payload.comment.body = '@home-assistant remove-label needs-more-information';
      mockContext.payload.issue.labels.push(mockedLabel('needs-more-information'));
      mockContext.payload.comment.user.login = 'test';
      mockContext.repository = HomeAssistantRepository.CORE;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '+1' }),
      );
      expect(mockContext.github.issues.removeLabel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'needs-more-information' }),
      );
    });
    it('by codeowner with invalid label', async () => {
      mockContext.payload.comment.body = '@home-assistant remove-label some-label';
      mockContext.payload.issue.labels.push(mockedLabel('needs-more-information'));
      mockContext.payload.comment.user.login = 'test';
      mockContext.repository = HomeAssistantRepository.CORE;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.removeLabel).not.toHaveBeenCalled();
    });
    it('by codeowner with not set label', async () => {
      mockContext.payload.comment.body = '@home-assistant remove-label some-label';
      mockContext.payload.comment.user.login = 'test';
      mockContext.repository = HomeAssistantRepository.CORE;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.removeLabel).not.toHaveBeenCalled();
    });
    it('not by codeowner with valid label', async () => {
      mockContext.payload.comment.body = '@home-assistant remove-label needs-more-information';
      mockContext.payload.comment.user.login = 'other';
      mockContext.payload.issue.labels.push(mockedLabel('needs-more-information'));
      mockContext.repository = HomeAssistantRepository.CORE;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.removeLabel).not.toHaveBeenCalled();
    });
    it('by codeowner without label', async () => {
      mockContext.payload.comment.body = '@home-assistant remove-label';
      mockContext.payload.comment.user.login = 'test';
      mockContext.payload.issue.labels.push(mockedLabel('needs-more-information'));
      mockContext.repository = HomeAssistantRepository.CORE;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.removeLabel).not.toHaveBeenCalled();
    });
    it('not by codeowner without label', async () => {
      mockContext.payload.comment.body = '@home-assistant remove-label';
      mockContext.payload.comment.user.login = 'other';
      mockContext.payload.issue.labels.push(mockedLabel('needs-more-information'));
      mockContext.repository = HomeAssistantRepository.CORE;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.issues.removeLabel).not.toHaveBeenCalled();
    });
  });

  describe('command: update-branch', () => {
    beforeEach(function () {
      mockContext.payload.comment.body = '@home-assistant update-branch';
      mockContext.payload.issue.pull_request = { url: 'https://api.github.com/repos/test/test/pulls/1' } as any;
    });

    it('by codeowner', async () => {
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '+1' }),
      );
      expect(mockContext.github.pulls.updateBranch).toHaveBeenCalled();
    });
    it('not by codeowner', async () => {
      mockContext.payload.comment.user.login = 'other';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.pulls.updateBranch).not.toHaveBeenCalled();
    });
    it('not on a pull request', async () => {
      mockContext.payload.comment.user.login = 'test';
      mockContext.payload.issue.pull_request = undefined;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.pulls.updateBranch).not.toHaveBeenCalled();
    });
    it('merge conflict posts comment', async () => {
      mockContext.payload.comment.user.login = 'test';
      (mockContext.github.pulls.updateBranch as unknown as jest.Mock).mockRejectedValue({
        response: { data: { message: 'Merge conflict' } },
      });
      await handler.handle(mockContext);

      expect(mockContext.github.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Failed to update branch: Merge conflict',
        }),
      );
      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
    });
  });

  describe('command: mark-draft', () => {
    beforeEach(function () {
      mockContext.payload.comment.body = '@home-assistant mark-draft';
      mockContext.payload.issue.pull_request = { url: 'https://api.github.com/repos/test/test/pulls/1' } as any;
      (mockContext.github.pulls.get as unknown as jest.Mock).mockResolvedValue({
        data: { node_id: 'PR_node_123', draft: false },
      });
    });

    it('by codeowner', async () => {
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '+1' }),
      );
      expect(mockContext.github.graphql).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('convertPullRequestToDraft'),
        }),
      );
    });
    it('not by codeowner', async () => {
      mockContext.payload.comment.user.login = 'other';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.graphql).not.toHaveBeenCalled();
    });
    it('already a draft', async () => {
      mockContext.payload.comment.user.login = 'test';
      (mockContext.github.pulls.get as unknown as jest.Mock).mockResolvedValue({
        data: { node_id: 'PR_node_123', draft: true },
      });
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.graphql).not.toHaveBeenCalled();
    });
    it('not on a pull request', async () => {
      mockContext.payload.comment.user.login = 'test';
      mockContext.payload.issue.pull_request = undefined;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.graphql).not.toHaveBeenCalled();
    });
  });

  describe('command: ready-for-review', () => {
    beforeEach(function () {
      mockContext.payload.comment.body = '@home-assistant ready-for-review';
      mockContext.payload.issue.pull_request = { url: 'https://api.github.com/repos/test/test/pulls/1' } as any;
      (mockContext.github.pulls.get as unknown as jest.Mock).mockResolvedValue({
        data: { node_id: 'PR_node_123', draft: true },
      });
    });

    it('by codeowner', async () => {
      mockContext.payload.comment.user.login = 'test';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '+1' }),
      );
      expect(mockContext.github.graphql).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('markPullRequestReadyForReview'),
        }),
      );
    });
    it('not by codeowner', async () => {
      mockContext.payload.comment.user.login = 'other';
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.graphql).not.toHaveBeenCalled();
    });
    it('not a draft', async () => {
      mockContext.payload.comment.user.login = 'test';
      (mockContext.github.pulls.get as unknown as jest.Mock).mockResolvedValue({
        data: { node_id: 'PR_node_123', draft: false },
      });
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.graphql).not.toHaveBeenCalled();
    });
    it('not on a pull request', async () => {
      mockContext.payload.comment.user.login = 'test';
      mockContext.payload.issue.pull_request = undefined;
      await handler.handle(mockContext);

      expect(mockContext.github.reactions.createForIssueComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: '-1' }),
      );
      expect(mockContext.github.graphql).not.toHaveBeenCalled();
    });
  });
});
