// @ts-nocheck
import * as assert from 'assert';
import * as sinon from 'sinon';
import { WebhookContext } from '../../../../../bots/src/github-webhook/github-webhook.model';
import {
  Hacktoberfest,
  isHacktoberfestLive,
} from '../../../../../services/bots/src/github-webhook/handlers/hacktoberfest';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';
import { PullRequestOpenedEvent } from '@octokit/webhooks-types';

describe('Hacktoberfest', () => {
  let handler: Hacktoberfest;
  let mockContext: WebhookContext<any>;
  let getLabelResponse: any;
  let removeLabel: any;

  beforeEach(function () {
    handler = new Hacktoberfest();
    getLabelResponse = {};
    removeLabel = undefined;
    mockContext = mockWebhookContext({
      eventType: 'pull_request.opened',
      payload: loadJsonFixture('pull_request.opened'),
      github: {
        issues: {
          async getLabel() {
            return getLabelResponse;
          },
          async removeLabel(label) {
            removeLabel = label;
          },
        },
      },
    });
  });

  describe('Check live', () => {
    it('Hacktoberfest is live', async () => {
      const clock = sinon.useFakeTimers(new Date(2020, 9, 1).getTime());
      assert.strictEqual(isHacktoberfestLive(), true);
      clock.restore();
    });
    it('Hacktoberfest is not live', async () => {
      const clock = sinon.useFakeTimers(new Date(2020, 8, 1).getTime());
      assert.strictEqual(isHacktoberfestLive(), false);
      clock.restore();
    });
  });

  it('Add hacktoberfest label on new PR', async () => {
    const clock = sinon.useFakeTimers(new Date(2020, 9, 1).getTime());
    mockContext.payload = loadJsonFixture('pull_request.opened', {
      repository: { topics: ['hacktoberfest'] },
    });
    await handler.handle(mockContext);
    clock.restore();

    assert.deepStrictEqual(mockContext.scheduledlabels, ['Hacktoberfest']);
  });

  it('Do not add hacktoberfest label on new PR if sender is bot', async () => {
    const clock = sinon.useFakeTimers(new Date(2020, 9, 1).getTime());
    mockContext.payload = loadJsonFixture<PullRequestOpenedEvent>('pull_request.opened', {
      sender: { type: 'Bot' },
    });
    await handler.handle(mockContext);
    clock.restore();

    assert.deepStrictEqual(mockContext.scheduledlabels, []);
  });

  it('Remove hacktoberfest label on closed PR', async () => {
    mockContext.eventType = 'pull_request.closed';
    mockContext.payload = loadJsonFixture('pull_request.opened', {
      pull_request: { labels: [{ name: 'Hacktoberfest' }], merged: false },
    });
    await handler.handle(mockContext);

    assert.deepStrictEqual(removeLabel, {
      issue_number: 2,
      name: 'Hacktoberfest',
      owner: 'Codertocat',
      repo: 'Hello-World',
    });
  });
});
