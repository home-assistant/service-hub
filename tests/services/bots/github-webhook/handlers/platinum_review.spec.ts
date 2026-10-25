// @ts-nocheck
import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import { PlatinumReview } from '../../../../../services/bots/src/github-webhook/handlers/platinum_review';
import { fetchIntegrationManifest } from '../../../../../services/bots/src/github-webhook/utils/integration';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';

jest.mock('../../../../../services/bots/src/github-webhook/utils/integration', () => ({
  ...jest.requireActual('../../../../../services/bots/src/github-webhook/utils/integration'),
  fetchIntegrationManifest: jest.fn(),
}));

const PLATINUM_LABELS = [{ name: 'Quality Scale: platinum' }, { name: 'integration: awesome' }];

describe('PlatinumReview', () => {
  let handler: PlatinumReview;
  let mockContext: WebhookContext<any>;

  beforeEach(function () {
    handler = new PlatinumReview();
    mockContext = mockWebhookContext({
      eventType: 'pull_request.opened',
      payload: loadJsonFixture('pull_request.opened', {}),
      github: {
        createCommitStatusWithRetry: jest.fn(),
        pulls: { listReviews: jest.fn() },
      },
    });
    mockContext.payload.pull_request.labels = PLATINUM_LABELS;
    fetchIntegrationManifest.mockResolvedValue({ codeowners: ['@owner'] });
  });

  it('sets pending while waiting for code owner approval', async () => {
    mockContext.github.pulls.listReviews.mockResolvedValue({
      data: [{ state: 'APPROVED', user: { login: 'someone-else' } }],
    });

    await handler.handle(mockContext);

    expect(mockContext.github.createCommitStatusWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'code-owner-approval',
        state: 'pending',
        description: 'Code owner approval required for Platinum integrations before merging',
      }),
    );
  });

  it('sets success after a code owner approves', async () => {
    mockContext.github.pulls.listReviews.mockResolvedValue({
      data: [{ state: 'APPROVED', user: { login: 'Owner' } }],
    });

    await handler.handle(mockContext);

    expect(mockContext.github.createCommitStatusWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'code-owner-approval',
        state: 'success',
        description: 'Code owner approval ok.',
      }),
    );
  });
});
