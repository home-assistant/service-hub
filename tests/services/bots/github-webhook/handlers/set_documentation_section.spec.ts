// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../bots/src/github-webhook/github-webhook.model';
import { SetDocumentationSection } from '../../../../../services/bots/src/github-webhook/handlers/set_documentation_section';
import { mockWebhookContext } from '../../../../utils/test_context';

describe('SetDocumentationSection', () => {
  let handler: SetIntegration;
  let mockContext: WebhookContext<any>;
  let getLabelResponse: any;

  beforeEach(function () {
    handler = new SetDocumentationSection();
    getLabelResponse = {};
    mockContext = mockWebhookContext({
      eventType: 'issues.opened',
      payload: {
        repository: { name: 'home-assistant.io', owner: { login: 'home-assistant' } },
        issue: {},
      },
      github: {
        async issuesGetLabel() {
          return getLabelResponse;
        },
      },
    });
  });

  it('Section label does exsist', async () => {
    mockContext.payload.issue.body =
      'Link: https://www.home-assistant.io/getting-started/configuration/';
    getLabelResponse = { name: 'configuration' };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, ['configuration']);
  });

  it('Section label does exsist only once', async () => {
    mockContext.payload.issue.body = `
    Link: https://www.home-assistant.io/getting-started/configuration/
    Link: https://www.home-assistant.io/getting-started/configuration/
    `;
    getLabelResponse = { name: 'configuration' };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, ['configuration']);
  });

  it('Section label does not exsist', async () => {
    mockContext.payload.issue.body =
      'Link: https://www.home-assistant.io/getting-started/configuration/';
    getLabelResponse = {};
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, []);
  });

  it('First section label does not exsist', async () => {
    mockContext.payload.issue.body =
      'Link: https://www.home-assistant.io/getting-started/configuration/';
    getLabelResponse = {};
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, []);

    getLabelResponse = { name: 'getting-started' };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, ['getting-started']);
  });

  it("Don't set section label for integration link", async () => {
    mockContext.payload.issue.body = 'Link: https://www.home-assistant.io/integrations/awesome/';
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, []);
  });
});
