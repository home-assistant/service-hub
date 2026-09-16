// @ts-nocheck
import * as assert from 'assert';
import { mockWebhookContext } from '../../../../utils/test_context';
import { SmallPRLabelUpdater } from '../../../../../services/bots/src/github-webhook/handlers/small_pr_label_updater';
import { loadJsonFixture } from '../../../../utils/fixture';

describe('SmallPRLabelUpdater', () => {
  let handler: SmallPRLabelUpdater;
  let mockContext;

  beforeEach(() => {
    handler = new SmallPRLabelUpdater();
    mockContext = mockWebhookContext({
      eventType: 'pull_request.synchronize',
      payload: {
        ...loadJsonFixture('pull_request.opened'),
        action: 'synchronize',
      },
      github: {
        issues: {
          removeLabel: jest.fn(),
        },
      },
    });
  });

  it('adds small-pr label when PR drops below threshold', async () => {
    mockContext.payload.pull_request.labels = [];
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/hue/light.py',
        additions: 10,
      },
    ];
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, ['small-pr']);
    assert.strictEqual(mockContext.github.issues.removeLabel.mock.calls.length, 0);
  });

  it('removes small-pr label when PR rises above threshold', async () => {
    mockContext.payload.pull_request.labels = [{ name: 'small-pr' }];
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/hue/light.py',
        additions: 50,
      },
    ];
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, []);
    assert.strictEqual(mockContext.github.issues.removeLabel.mock.calls.length, 1);
  });

  it('does nothing when PR is small and already has label', async () => {
    mockContext.payload.pull_request.labels = [{ name: 'small-pr' }];
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/hue/light.py',
        additions: 10,
      },
    ];
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, []);
    assert.strictEqual(mockContext.github.issues.removeLabel.mock.calls.length, 0);
  });

  it('does nothing when PR is large and has no label', async () => {
    mockContext.payload.pull_request.labels = [];
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/hue/light.py',
        additions: 50,
      },
    ];
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, []);
    assert.strictEqual(mockContext.github.issues.removeLabel.mock.calls.length, 0);
  });

  it('excludes test files from addition count', async () => {
    mockContext.payload.pull_request.labels = [];
    mockContext._prFilesCache = [
      {
        filename: 'homeassistant/components/hue/light.py',
        additions: 10,
      },
      {
        filename: 'tests/components/hue/test_light.py',
        additions: 200,
      },
    ];
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, ['small-pr']);
  });
});
