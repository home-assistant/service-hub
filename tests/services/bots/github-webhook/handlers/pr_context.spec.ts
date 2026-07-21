// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import { PrContext } from '../../../../../services/bots/src/github-webhook/handlers/pr_context';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';

const makeContext = (labelName: string): WebhookContext<any> =>
  mockWebhookContext({
    eventType: 'pull_request.labeled',
    payload: loadJsonFixture('pull_request.opened', {
      label: { name: labelName },
      pull_request: { user: { login: 'octocat' } },
    }),
  });

describe('PrContext', () => {
  let handler: PrContext;

  beforeEach(() => {
    handler = new PrContext();
  });

  it('comments with the guidance for the new-integration label', async () => {
    const context = makeContext('new-integration');

    await handler.handle(context);

    assert.strictEqual(context.scheduledComments.length, 1);
    const [scheduled] = context.scheduledComments;
    assert.strictEqual(scheduled.handler, 'PrContext');
    assert.ok(scheduled.comment.startsWith('@octocat '));
    assert.ok(scheduled.comment.includes('development checklist'));
    assert.ok(scheduled.comment.includes('separate library on PyPI'));
    assert.ok(scheduled.comment.includes('quality-scale rules'));
    assert.ok(scheduled.comment.includes('single platform'));
  });

  it('does nothing for a label we have no context for', async () => {
    const context = makeContext('bugfix');

    await handler.handle(context);

    assert.strictEqual(context.scheduledComments.length, 0);
  });
});
