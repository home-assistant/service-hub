// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../bots/src/github-webhook/github-webhook.model';
import { IssueLinks } from '../../../../../services/bots/src/github-webhook/handlers/issue_links';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';

describe('SetIntegration', () => {
  let handler: IssueLinks;
  let mockContext: WebhookContext<any>;
  let getLabelResponse: any;

  beforeEach(function () {
    handler = new IssueLinks();
    getLabelResponse = {};
    mockContext = mockWebhookContext({
      eventType: 'issues.labeled',
      payload: loadJsonFixture('pull_request.opened', {
        label: { name: 'integration: awesome' },
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
        handler: 'IssueLinks',
        comment:
          '[awesome documentation](https://www.home-assistant.io/integrations/awesome)\n[awesome source](https://github.com/home-assistant/core/tree/dev/homeassistant/components/awesome)',
      },
    ]);
  });
});
