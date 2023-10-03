// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../bots/src/github-webhook/github-webhook.model';
import { MergeConflictChecker } from '../../../../../services/bots/src/github-webhook/handlers/merge_conflict';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';

describe('MergeConflictChecker', () => {
  let handler: MergeConflictChecker;
  let mockContext: WebhookContext<any>;
  let getPullResponse: any;
  let createReviewContents: PullRequestCreateReviewParams;

  beforeEach(function () {
    handler = new MergeConflictChecker();
    getPullResponse = { data: {} };
    createReviewContents = {};
    mockContext = mockWebhookContext({
      eventType: 'pull_request.opened',
      payload: loadJsonFixture('pull_request.opened', {}),
      github: {
        pulls: {
          async get() {
            return getPullResponse;
          },
          async createReview(params: PullRequestCreateReviewParams) {
            createReviewContents = params;
          },
        },
      },
    });
  });

  it('PR with clean state', async () => {
    mockContext.github.pulls.createReview = jest.fn();
    getPullResponse = { data: { mergeable_state: 'clean' } };

    await handler.handle(mockContext);

    assert.deepStrictEqual(createReviewContents, {});
    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
  });

  it('PR with dirty state', async () => {
    getPullResponse = { data: { mergeable_state: 'dirty' } };

    await handler.handle(mockContext);

    assert.deepStrictEqual(createReviewContents, {
      body: 'There is a merge conflict.',
      event: 'REQUEST_CHANGES',
      owner: 'Codertocat',
      pull_number: 2,
      repo: 'Hello-World',
    });
  });
});
