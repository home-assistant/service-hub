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
      payload: loadJsonFixture('pull_request.opened', {
        label: { name: 'integration: demo' },
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

  it('Add comment', async () => {
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledComments, [
      {
        handler: 'IssueContext',
        comment: 'This is a demo integration.',
      },
    ]);
  });
});
