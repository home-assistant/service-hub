// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../bots/src/github-webhook/github-webhook.model';
import { SetIntegration } from '../../../../../services/bots/src/github-webhook/handlers/set_integration';
import { HomeAssistantRepository } from '../../../../../services/bots/src/github-webhook/github-webhook.const';
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
    mockContext.repository = HomeAssistantRepository.CORE;
    getLabelResponse = { status: 404 };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, []);
    assert.strictEqual(mockContext.scheduledComments.length, 1);
    assert.strictEqual(mockContext.scheduledComments[0].handler, 'SetIntegration');
    assert.ok(mockContext.scheduledComments[0].comment.includes('@home-assistant set-integration'));
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

  it('No integration link in body - hint posted to author', async () => {
    mockContext.payload.issue.body = 'Something is broken, please help.';
    mockContext.payload.issue.user = { login: 'someuser' };
    mockContext.repository = HomeAssistantRepository.CORE;
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, []);
    assert.strictEqual(mockContext.scheduledComments.length, 1);
    assert.strictEqual(mockContext.scheduledComments[0].handler, 'SetIntegration');
    assert.ok(mockContext.scheduledComments[0].comment.includes('@someuser'));
    assert.ok(mockContext.scheduledComments[0].comment.includes('@home-assistant set-integration'));
    assert.ok(mockContext.scheduledComments[0].comment.includes('set-integration zha'));
  });

  it('No hint on home-assistant.io repo', async () => {
    mockContext.payload.issue.body = 'Something is broken, please help.';
    mockContext.repository = HomeAssistantRepository.HOME_ASSISTANT_IO;
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, []);
    assert.strictEqual(mockContext.scheduledComments.length, 0);
  });
});
