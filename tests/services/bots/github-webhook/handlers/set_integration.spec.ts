// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from 'services/bots/src/github-webhook/github-webhook.model';
import { SetIntegration } from '../../../../../services/bots/src/github-webhook/handlers/set_integration';
import { mockWebhookContext } from '../../../../utils/test_context';

describe('SetIntegration', () => {
  let handler: SetIntegration;
  let mockContext: WebhookContext<any>;
  let getLabelResponse: any;

  beforeEach(function () {
    handler = new SetIntegration();
    getLabelResponse = {};
    mockContext = mockWebhookContext({
      eventType: 'issues.opened',
      payload: {
        issue: {},
      },
      github: {
        issues: {
          async getLabel() {
            return getLabelResponse;
          },
        },
      },
    });
  });

  it('Integration label does exsist', async () => {
    mockContext.payload.issue.body = 'Link: https://www.home-assistant.io/integrations/awesome';
    getLabelResponse = { status: 200, data: { name: 'integration: awesome' } };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: awesome']);
  });

  it('Integration label does not exsist', async () => {
    mockContext.payload.issue.body = 'Link: https://www.home-assistant.io/integrations/not_valid';
    getLabelResponse = { status: 404 };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, []);
  });

  it('Integration with underscore', async () => {
    mockContext.payload.issue.body =
      'Link: https://www.home-assistant.io/integrations/awesome_integration';
    getLabelResponse = {
      status: 200,
      data: { name: 'integration: awesome_integration' },
    };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: awesome_integration']);
  });

  it('Integration with platform', async () => {
    mockContext.payload.issue.body =
      'Link: https://www.home-assistant.io/integrations/platform.awesome';
    getLabelResponse = {
      status: 200,
      data: { name: 'integration: awesome' },
    };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: awesome']);
  });
});
