// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../bots/src/github-webhook/github-webhook.model';
import { LabelBot } from '../../../../../services/bots/src/github-webhook/handlers/label_bot/handler';
import { mockWebhookContext } from '../../../../utils/test_context';

describe('LabelBot', () => {
  let handler: LabelBot;
  let mockContext: WebhookContext<any>;
  let getLabelResponse: any;

  beforeEach(function () {
    handler = new LabelBot();
    getLabelResponse = {};
    mockContext = mockWebhookContext({
      eventType: 'pull_request.opened',
      payload: {
        pull_request: {},
      },
      github: {
        issues: {},
      },
    });
  });

  it('works', async () => {
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/mqtt/climate.py',
      },
    ];
    mockContext.payload.pull_request.base = { ref: 'master' };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, [
      'core',
      'merging-to-master',
      'integration: mqtt',
    ]);
  });

  it('many labels', async () => {
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/mqtt/climate.py',
      },
      {
        filename: 'homeassistant/components/hue/light.py',
      },
      {
        filename: 'homeassistant/components/zha/lock.py',
      },
      {
        filename: 'homeassistant/components/switch/group.py',
      },
      {
        filename: 'homeassistant/components/camera/__init__.py',
      },
      {
        filename: 'homeassistant/components/zwave/sensor.py',
      },
      {
        filename: 'homeassistant/components/zeroconf/usage.py',
      },
      {
        filename: 'homeassistant/components/xiaomi/device_tracker.py',
      },
      {
        filename: 'homeassistant/components/tts/notify.py',
      },
      {
        filename: 'homeassistant/components/serial/sensor.py',
      },
    ];
    mockContext.payload.pull_request = {
      body:
        '\n- [x] Bugfix (non-breaking change which fixes an issue)' +
        '\n- [x] Breaking change (fix/feature causing existing functionality to break)',
      base: { ref: 'master' },
    };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, [
      'core',
      'bugfix',
      'breaking-change',
      'merging-to-master',
    ]);
  });
});
