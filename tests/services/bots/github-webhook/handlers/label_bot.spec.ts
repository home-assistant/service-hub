// @ts-nocheck
import * as assert from 'assert';
import { mockWebhookContext } from '../../../../utils/test_context';
import { LabelBot } from '../../../../../services/bots/src/github-webhook/handlers/label_bot/handler';
import { IntegrationAnalyticsService } from '../../../../../services/bots/src/github-webhook/handlers/label_bot/integration-analytics.service';

const mockAnalyticsData = {
  integrations: Object.fromEntries(
    // mqtt at rank 3, hue at rank 201 (outside top 200)
    [
      ...Array.from({ length: 2 }, (_, i) => [`top_integration_${i}`, 10000 - i]),
      ['mqtt', 9998],
      ...Array.from({ length: 197 }, (_, i) => [`filler_${i}`, 9000 - i]),
      ['hue', 1],
    ],
  ),
};

describe('LabelBot', () => {
  let handler: LabelBot;
  let mockContext;

  beforeEach(async function () {
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve(mockAnalyticsData),
    });
    const analyticsService = new IntegrationAnalyticsService();
    await analyticsService.onModuleInit();
    handler = new LabelBot(analyticsService);
    mockContext = mockWebhookContext({
      eventType: 'pull_request.opened',
      github: {
        issues: {},
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
      'Top 200',
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
        '\n- [x] Deprecation (breaking change to happen in the future)' +
        '\n- [ x] Bugfix (non-breaking change which fixes an issue)' +
        '\n- [X ] Breaking change (fix/feature causing existing functionality to break)' +
        '\n- [ ] Code quality improvements to existing code or addition of tests' +
        '\n- [ ] Dependency upgrade' +
        '\n- [C] New integration (thank you!)',
      base: { ref: 'master' },
    };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, [
      'core',
      'bugfix',
      'new-integration',
      'deprecation',
      'breaking-change',
      'merging-to-master',
    ]);
  });

  it('does not add Top 200 label for non-top integrations', async () => {
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/hue/light.py',
      },
    ];
    mockContext.payload.pull_request.base = { ref: 'dev' };
    await handler.handle(mockContext);
    assert.ok(!mockContext.scheduledlabels.includes('Top 200'));
    assert.ok(mockContext.scheduledlabels.includes('integration: hue'));
  });

  it('does not add Top 200 label for non-component files', async () => {
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/core.py',
      },
    ];
    mockContext.payload.pull_request.base = { ref: 'dev' };
    await handler.handle(mockContext);
    assert.ok(!mockContext.scheduledlabels.includes('Top 200'));
  });
});
