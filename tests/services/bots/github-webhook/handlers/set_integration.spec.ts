// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../bots/src/github-webhook/github-webhook.model';
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
      github: {
        async issuesGetLabel() {
          return getLabelResponse;
        },
      },
    });
  });

  it('Integration label does exist', async () => {
    mockContext.payload.issue.body = 'Link: https://www.home-assistant.io/integrations/awesome';
    getLabelResponse = { name: 'integration: awesome' };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: awesome']);
  });

  it('Integration label does not exist', async () => {
    mockContext.payload.issue.body = 'Link: https://www.home-assistant.io/integrations/not_valid';
    getLabelResponse = { status: 404 };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, []);
  });

  it('Integration with underscore', async () => {
    mockContext.payload.issue.body =
      'Link: https://www.home-assistant.io/integrations/awesome_integration';
    getLabelResponse = {
      name: 'integration: awesome_integration',
    };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: awesome_integration']);
  });

  it('Integration with platform', async () => {
    mockContext.payload.issue.body =
      'Link: https://www.home-assistant.io/integrations/sensor.awesome';
    getLabelResponse = {
      name: 'integration: awesome',
    };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: awesome']);
  });

  it('Integration with platform', async () => {
    mockContext.payload.issue.body =
      'Link: https://www.home-assistant.io/integrations/awesome.sensor';
    getLabelResponse = {
      name: 'integration: awesome',
    };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: awesome']);
  });

  it('Link takes priority over body field', async () => {
    mockContext.payload.issue.body =
      '### Integration causing the issue\n\nRain bird\n\n### Link to integration documentation\n\nhttps://www.home-assistant.io/integrations/rainbird';
    getLabelResponse = { name: 'integration: rainbird' };
    let labelCheckCount = 0;
    mockContext = mockWebhookContext({
      eventType: 'issues.opened',
      github: {
        async issuesGetLabel() {
          labelCheckCount++;
          return getLabelResponse;
        },
      },
    });
    mockContext.payload.issue.body =
      '### Integration causing the issue\n\nRain bird\n\n### Link to integration documentation\n\nhttps://www.home-assistant.io/integrations/rainbird';
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: rainbird']);
    assert.strictEqual(labelCheckCount, 1, 'Should stop after finding the link match');
  });

  it('Falls back to body field when no link provided', async () => {
    mockContext.payload.issue.body =
      '### Integration causing the issue\n\nRain bird\n\n### Link to integration documentation\n\n_No response_';
    getLabelResponse = { name: 'integration: rainbird' };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: rainbird']);
  });

  it('Body field fallback with uppercase', async () => {
    mockContext.payload.issue.body =
      '### Integration causing the issue\n\nZHA\n\n### Link to integration documentation\n\n_No response_';
    getLabelResponse = { name: 'integration: zha' };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: zha']);
  });

  it('Body field fallback tries underscore variant', async () => {
    let callIndex = 0;
    mockContext = mockWebhookContext({
      eventType: 'issues.opened',
      github: {
        async issuesGetLabel({ name }: { name: string }) {
          callIndex++;
          if (name === 'integration: home_connect') {
            return { name: 'integration: home_connect' };
          }
          return { status: 404 };
        },
      },
    });
    mockContext.payload.issue.body =
      '### Integration causing the issue\n\nHome Connect\n\n### Link to integration documentation\n\n_No response_';
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: home_connect']);
    assert.strictEqual(callIndex, 2, 'Should try 2 variants before finding home_connect');
  });

  it('No label when body field is _No response_', async () => {
    mockContext.payload.issue.body =
      '### Integration causing the issue\n\n_No response_\n\n### Link to integration documentation\n\n_No response_';
    getLabelResponse = { status: 404 };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, []);
  });
});
