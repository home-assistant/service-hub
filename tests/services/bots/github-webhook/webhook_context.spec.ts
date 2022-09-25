// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../services/bots/src/github-webhook/github-webhook.model';

describe('WebhookContext', () => {
  const context = new WebhookContext({
    github: {},
    payload: {
      repository: { owner: { login: 'awesome_owner' }, name: 'awesome_name' },
      sender: {},
      number: 1337,
    },
    eventType: '',
  });
  it('senderIsBot', () => {
    context.payload.sender.type = 'Bot';
    assert.deepStrictEqual(context.senderIsBot, true);

    context.payload.sender.type = 'User';
    context.payload.sender.login = 'homeassistant';
    assert.deepStrictEqual(context.senderIsBot, true);

    context.payload.sender = {};
    assert.deepStrictEqual(context.senderIsBot, false);
  });
  describe('Context helpers', () => {
    it('repo', () => {
      assert.deepStrictEqual(context.repo(), { owner: 'awesome_owner', repo: 'awesome_name' });
      assert.deepStrictEqual(context.repo({ additional: true }), {
        owner: 'awesome_owner',
        repo: 'awesome_name',
        additional: true,
      });
    });
    it('issue', () => {
      assert.deepStrictEqual(context.issue(), {
        owner: 'awesome_owner',
        repo: 'awesome_name',
        issue_number: 1337,
      });
      assert.deepStrictEqual(context.issue({ additional: true }), {
        owner: 'awesome_owner',
        repo: 'awesome_name',
        issue_number: 1337,
        additional: true,
      });
    });
    it('pullRequest', () => {
      assert.deepStrictEqual(context.pullRequest(), {
        owner: 'awesome_owner',
        repo: 'awesome_name',
        pull_number: 1337,
      });
      assert.deepStrictEqual(context.pullRequest({ additional: true }), {
        owner: 'awesome_owner',
        repo: 'awesome_name',
        pull_number: 1337,
        additional: true,
      });
    });
  });

  describe('Schedule helpers', () => {
    const context = new WebhookContext({
      github: {},
      payload: { repository: { name: 'awesome_repo' } },
      eventType: '',
    });
    it('label', () => {
      context.scheduleIssueLabel('test');
      assert.deepStrictEqual(context.scheduledlabels, ['test']);
    });
    it('comment', () => {
      context.scheduleIssueComment({ handler: 'test', comment: 'hi' });
      assert.deepStrictEqual(context.scheduledComments, [{ handler: 'test', comment: 'hi' }]);
    });
  });
});
