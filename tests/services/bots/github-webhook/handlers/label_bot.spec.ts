// @ts-nocheck
import * as assert from 'assert';
import { mockWebhookContext } from '../../../../utils/test_context';
import { LabelBot } from '../../../../../services/bots/src/github-webhook/handlers/label_bot/handler';
import { IntegrationAnalyticsService } from '../../../../../services/bots/src/github-webhook/handlers/label_bot/integration-analytics.service';

const mockAnalyticsData = {
  integrations: Object.fromEntries([
    // Ranks 0-1: filler integrations
    ...Array.from({ length: 2 }, (_, i) => [`top_integration_${i}`, 10000 - i]),
    // Rank 2: mqtt (inside top 50)
    ['mqtt', 9998],
    // Ranks 3-74: fillers
    ...Array.from({ length: 72 }, (_, i) => [`filler_a_${i}`, 9000 - i]),
    // Rank 75: tasmota (inside top 100, outside top 50)
    ['tasmota', 8000],
    // Ranks 76-98: fillers
    ...Array.from({ length: 23 }, (_, i) => [`filler_b_${i}`, 7000 - i]),
    // Rank 99: esphome (exactly last position in top 100)
    ['esphome', 6500],
    // Ranks 100-149: fillers
    ...Array.from({ length: 50 }, (_, i) => [`filler_b2_${i}`, 6400 - i]),
    // Rank 150: wled (inside top 200, outside top 100)
    ['wled', 6000],
    // Ranks 151-199: fillers
    ...Array.from({ length: 49 }, (_, i) => [`filler_c_${i}`, 5000 - i]),
    // Rank 200: hue (outside top 200)
    ['hue', 1],
  ]),
};

describe('LabelBot', () => {
  let handler: LabelBot;
  let mockContext;

  beforeEach(async function () {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAnalyticsData),
    } as any);
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

  it('adds Top 50, Top 100 and Top 200 labels for top 50 integration', async () => {
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
      'Top 50',
      'Top 100',
      'Top 200',
    ]);
  });

  it('adds Top 100 and Top 200 labels for top 100 integration', async () => {
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/tasmota/sensor.py',
      },
    ];
    mockContext.payload.pull_request.base = { ref: 'dev' };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, [
      'integration: tasmota',
      'Top 100',
      'Top 200',
    ]);
  });

  it('adds only Top 200 label for top 200 integration', async () => {
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/wled/light.py',
      },
    ];
    mockContext.payload.pull_request.base = { ref: 'dev' };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: wled', 'Top 200']);
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

  it('does not add top labels for non-top integrations', async () => {
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/hue/light.py',
      },
    ];
    mockContext.payload.pull_request.base = { ref: 'dev' };
    await handler.handle(mockContext);
    assert.ok(!mockContext.scheduledlabels.includes('Top 50'));
    assert.ok(!mockContext.scheduledlabels.includes('Top 100'));
    assert.ok(!mockContext.scheduledlabels.includes('Top 200'));
    assert.ok(mockContext.scheduledlabels.includes('integration: hue'));
  });

  it('does not add top labels for non-component files', async () => {
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/core.py',
      },
    ];
    mockContext.payload.pull_request.base = { ref: 'dev' };
    await handler.handle(mockContext);
    assert.ok(!mockContext.scheduledlabels.includes('Top 50'));
    assert.ok(!mockContext.scheduledlabels.includes('Top 100'));
    assert.ok(!mockContext.scheduledlabels.includes('Top 200'));
  });

  it('adds Top 100 and Top 200 labels for integration at exactly rank 100', async () => {
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/esphome/sensor.py',
      },
    ];
    mockContext.payload.pull_request.base = { ref: 'dev' };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, [
      'integration: esphome',
      'Top 100',
      'Top 200',
    ]);
  });

  it('uses best rank when PR touches multiple integrations', async () => {
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/wled/light.py',
      },
      {
        filename: 'homeassistant/components/mqtt/climate.py',
      },
    ];
    mockContext.payload.pull_request.base = { ref: 'dev' };
    await handler.handle(mockContext);
    assert.ok(mockContext.scheduledlabels.includes('Top 50'));
    assert.ok(mockContext.scheduledlabels.includes('Top 100'));
    assert.ok(mockContext.scheduledlabels.includes('Top 200'));
  });

  it('applies Supervisor-only strategy set and skips integration/component labeling', async () => {
    mockContext.payload.repository = { full_name: 'home-assistant/supervisor' };
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/mqtt/climate.py',
        additions: 1,
      },
      {
        filename: 'tests/components/mqtt/test_climate.py',
        additions: 1,
      },
    ];
    mockContext.payload.pull_request = {
      body:
        '\n- [x] Bugfix (non-breaking change which fixes an issue)' +
        '\n- [x] Code quality improvements to existing code or addition of tests' +
        '\n- [ ] Dependency upgrade' +
        '\n- [ ] New feature (which adds functionality to the supervisor)' +
        '\n- [ ] Breaking change (fix/feature causing existing functionality to break)',
      base: { ref: 'main' },
    };

    await handler.handle(mockContext);

    // Should include Supervisor type-of-change labels
    assert.ok(mockContext.scheduledlabels.includes('bugfix'));
    assert.ok(mockContext.scheduledlabels.includes('refactor'));

    // Must NOT include Core-only labeling behaviors
    assert.ok(!mockContext.scheduledlabels.includes('has-tests'));
    assert.ok(!mockContext.scheduledlabels.includes('small-pr'));
    assert.ok(!mockContext.scheduledlabels.includes('core'));
    assert.ok(!mockContext.scheduledlabels.some((l) => l.startsWith('integration: ')));
    assert.ok(!mockContext.scheduledlabels.includes('Top 50'));
    assert.ok(!mockContext.scheduledlabels.includes('Top 100'));
    assert.ok(!mockContext.scheduledlabels.includes('Top 200'));
    assert.ok(!mockContext.scheduledlabels.includes('merging-to-master'));
  });
});
