// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../bots/src/github-webhook/github-webhook.model';
import { IssueContext } from '../../../../../services/bots/src/github-webhook/handlers/issue_context';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';

describe('IssueContext', () => {
  let handler: IssueContext;
  let mockContext: WebhookContext<any>;
  let getLabelResponse: any;

  beforeEach(function () {
    handler = new IssueContext();
    getLabelResponse = {};
    mockContext = mockWebhookContext({
      eventType: 'issues.labeled',
      payload: loadJsonFixture('issues.labeled', {
        label: { name: 'integration: demo' },
        issue: { user: { login: 'testuser' } },
      }),
      github: {
        issues: {
          async getLabel() {
            return getLabelResponse;
          },
        },
      },
    });
  });

  it('Add comment with default message and integration context', async () => {
    await handler.handle(mockContext);

    assert.strictEqual(mockContext.scheduledComments.length, 1);
    assert.strictEqual(mockContext.scheduledComments[0].handler, 'IssueContext');

    const comment = mockContext.scheduledComments[0].comment;
    assert.ok(comment.startsWith('@testuser'), 'Should mention the issue author');
    assert.ok(
      comment.includes('Thanks for reporting this issue!'),
      'Should include default message',
    );
    assert.ok(comment.includes('integration%3A%20demo'), 'Should include issue search link');
    assert.ok(
      comment.includes('This is a demo integration.'),
      'Should include integration-specific context',
    );
  });

  it('Add comment for integration without specific context', async () => {
    mockContext.payload.label.name = 'integration: unknown';

    await handler.handle(mockContext);

    assert.strictEqual(mockContext.scheduledComments.length, 1);

    const comment = mockContext.scheduledComments[0].comment;
    assert.ok(comment.startsWith('@testuser'), 'Should mention the issue author');
    assert.ok(
      comment.includes('Thanks for reporting this issue!'),
      'Should include default message',
    );
    assert.ok(comment.includes('integration%3A%20unknown'), 'Should include issue search link');
    assert.ok(
      !comment.includes('This is a demo integration.'),
      'Should not include demo-specific context',
    );
  });

  it('Skip non-integration labels', async () => {
    mockContext.payload.label.name = 'bug';

    await handler.handle(mockContext);

    assert.strictEqual(
      mockContext.scheduledComments.length,
      0,
      'Should not add comment for non-integration labels',
    );
  });
});
