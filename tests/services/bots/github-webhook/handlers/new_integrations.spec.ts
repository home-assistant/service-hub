// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import { NewIntegrationsHandler } from '../../../../../services/bots/src/github-webhook/handlers/new_integrations';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';

describe('NewIntegrationsHandler', () => {
  let handler: NewIntegrationsHandler;
  let mockContext: WebhookContext<any>;

  beforeEach(function () {
    handler = new NewIntegrationsHandler();
    mockContext = mockWebhookContext({
      eventType: 'pull_request.labeled',
      payload: loadJsonFixture('pull_request.opened', {
        label: { name: 'new-integration' },
      }),
      github: {
        pulls: {
          createReview: jest.fn(),
        },
      },
    });
  });

  it('does nothing when the label is not new-integration', async () => {
    mockContext.payload.label = { name: 'bugfix' };
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: 'homeassistant/components/my_integration/climate.py' },
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
  });

  it('does nothing when a new-integration PR has a single platform and no brand folder', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
  });

  it('requests changes when the PR contains multiple platforms', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: 'homeassistant/components/my_integration/climate.py' },
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('single platform'));
    assert.ok(!call.body.includes('brand'));
  });

  it('requests changes when the PR contains a brand folder', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: 'homeassistant/components/my_integration/brand/icon.png' },
      { filename: 'homeassistant/components/my_integration/brand/logo.png' },
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('brand'));
    assert.ok(
      call.body.includes('https://developers.home-assistant.io/docs/core/integration/brand_images'),
    );
    assert.ok(!call.body.includes('single platform'));
  });

  it('requests changes with a combined message when the PR has both multiple platforms and a brand folder', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: 'homeassistant/components/my_integration/climate.py' },
      { filename: 'homeassistant/components/my_integration/brand/icon.png' },
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('single platform'));
    assert.ok(call.body.includes('brand'));
    assert.ok(
      call.body.includes('https://developers.home-assistant.io/docs/core/integration/brand_images'),
    );
  });
});
