// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import { LabelActions } from '../../../../../services/bots/src/github-webhook/handlers/label_actions';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';

describe('LabelActions', () => {
  let handler: LabelActions;
  let mockContext: WebhookContext<any>;

  const createContext = (repository: string, override: Record<string, any> = {}) =>
    mockWebhookContext({
      eventType: 'issues.labeled',
      payload: loadJsonFixture('issues.labeled', {
        repository: {
          full_name: repository,
          name: repository.split('/')[1],
          owner: { login: repository.split('/')[0] },
        },
        issue: { user: { login: 'testuser' }, state: 'open' },
        ...override,
      }),
    });

  beforeEach(function () {
    handler = new LabelActions();
    mockContext = createContext('home-assistant/operating-system', {
      label: { name: 'core-issue' },
    });
  });

  it('Add comment and close issue for configured label', async () => {
    await handler.handle(mockContext);

    assert.strictEqual(mockContext.scheduledComments.length, 1);
    assert.strictEqual(mockContext.scheduledComments[0].handler, 'LabelActions');

    const comment = mockContext.scheduledComments[0].comment;
    assert.ok(comment.includes('@testuser'), 'Should mention the issue author');
    assert.ok(!comment.includes('{issue-author}'), 'Should replace the author placeholder');
    assert.ok(
      comment.includes('related to Home Assistant Core'),
      'Should include the configured comment',
    );

    expect(mockContext.github.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'home-assistant',
        repo: 'operating-system',
        state: 'closed',
        state_reason: 'not_planned',
      }),
    );
  });

  it('Replace repository placeholder in comment', async () => {
    mockContext = createContext('home-assistant/operating-system', {
      label: { name: 'assume-fixed' },
    });

    await handler.handle(mockContext);

    assert.strictEqual(mockContext.scheduledComments.length, 1);
    assert.ok(
      mockContext.scheduledComments[0].comment.includes(
        'https://github.com/home-assistant/operating-system/releases/latest',
      ),
      'Should replace the repository placeholder',
    );
  });

  it('Use action in any repository of the organization', async () => {
    mockContext = createContext('home-assistant/supervisor', {
      label: { name: 'core-issue' },
    });

    await handler.handle(mockContext);

    assert.strictEqual(mockContext.scheduledComments.length, 1);
    assert.ok(
      mockContext.scheduledComments[0].comment.includes('related to Home Assistant Core'),
      'Should include the shared comment',
    );
  });

  it('Add comment and close issue for docker-corruption label', async () => {
    mockContext = createContext('home-assistant/supervisor', {
      label: { name: 'docker-corruption' },
    });

    await handler.handle(mockContext);

    assert.strictEqual(mockContext.scheduledComments.length, 1);
    assert.ok(
      mockContext.scheduledComments[0].comment.includes('Docker image storage got corrupted'),
      'Should include the supervisor specific comment',
    );
    expect(mockContext.github.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'closed', state_reason: 'not_planned' }),
    );
  });

  it('Skip labels without configured action', async () => {
    mockContext = createContext('home-assistant/operating-system', {
      label: { name: 'bug' },
    });

    await handler.handle(mockContext);

    assert.strictEqual(mockContext.scheduledComments.length, 0);
    expect(mockContext.github.issues.update).not.toHaveBeenCalled();
  });

  it('Do not close already closed issues', async () => {
    mockContext = createContext('home-assistant/operating-system', {
      label: { name: 'core-issue' },
      issue: { state: 'closed' },
    });

    await handler.handle(mockContext);

    assert.strictEqual(mockContext.scheduledComments.length, 1);
    expect(mockContext.github.issues.update).not.toHaveBeenCalled();
  });
});
