// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import { DocsMissing } from '../../../../../services/bots/src/github-webhook/handlers/docs_missing';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';

describe('DocsMissing', () => {
  let handler: DocsMissing;
  let mockContext: WebhookContext<any>;
  let createCommitStatusContents: any;

  beforeEach(function () {
    handler = new DocsMissing();
    createCommitStatusContents = {};
    mockContext = mockWebhookContext({
      eventType: 'pull_request.labeled',
      payload: loadJsonFixture('pull_request.opened', {}),
      github: {
        repos: {
          async createCommitStatus(params: any) {
            createCommitStatusContents = params;
          },
        },
      },
    });
  });

  it('PR targeting master branch should auto-approve docs check', async () => {
    mockContext.github.repos.createCommitStatus = jest.fn();
    // Override the base ref to target master
    mockContext.payload.pull_request.base.ref = 'master';

    await handler.handle(mockContext);

    expect(mockContext.github.repos.createCommitStatus).toHaveBeenCalledWith({
      owner: 'Codertocat',
      repo: 'Hello-World',
      sha: 'ec26c3e57ca3a959ca5aad62de7213c562f8c821',
      context: 'docs-missing',
      state: 'success',
      description: 'Documentation check auto-approved for release PR.',
    });
  });

  it('PR targeting dev branch should run docs check - no labels', async () => {
    mockContext.github.repos.createCommitStatus = jest.fn();
    // Override the base ref to target dev (non-master branch)
    mockContext.payload.pull_request.base.ref = 'dev';
    // Clear any existing labels
    mockContext.payload.pull_request.labels = [];

    await handler.handle(mockContext);

    expect(mockContext.github.repos.createCommitStatus).toHaveBeenCalledWith({
      owner: 'Codertocat',
      repo: 'Hello-World',
      sha: 'ec26c3e57ca3a959ca5aad62de7213c562f8c821',
      context: 'docs-missing',
      state: 'success',
      description: 'Documentation ok.',
    });
  });

  it('PR targeting dev branch with docs-missing label should fail', async () => {
    mockContext.github.repos.createCommitStatus = jest.fn();
    // Override the base ref to target dev (non-master branch)
    mockContext.payload.pull_request.base.ref = 'dev';
    // Add docs-missing label
    mockContext.payload.pull_request.labels = [{ name: 'docs-missing' }];

    await handler.handle(mockContext);

    expect(mockContext.github.repos.createCommitStatus).toHaveBeenCalledWith({
      owner: 'Codertocat',
      repo: 'Hello-World',
      sha: 'ec26c3e57ca3a959ca5aad62de7213c562f8c821',
      context: 'docs-missing',
      state: 'failure',
      description: 'Please open a documentation PR.',
    });
  });

  it('PR targeting dev branch with new-integration label but no docs link should fail', async () => {
    mockContext.github.repos.createCommitStatus = jest.fn();
    // Override the base ref to target dev (non-master branch)
    mockContext.payload.pull_request.base.ref = 'dev';
    // Add new-integration label
    mockContext.payload.pull_request.labels = [{ name: 'new-integration' }];
    // Clear the body to not have any docs links
    mockContext.payload.pull_request.body = 'This is a new integration without docs link.';

    await handler.handle(mockContext);

    expect(mockContext.github.repos.createCommitStatus).toHaveBeenCalledWith({
      owner: 'Codertocat',
      repo: 'Hello-World',
      sha: 'ec26c3e57ca3a959ca5aad62de7213c562f8c821',
      context: 'docs-missing',
      state: 'failure',
      description: 'Please open a documentation PR.',
    });
  });
});