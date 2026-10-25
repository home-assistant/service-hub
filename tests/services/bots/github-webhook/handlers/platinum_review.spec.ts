import { Label, PullRequestLabeledEvent } from '@octokit/webhooks-types';
import { EventType } from '../../../../../services/bots/src/github-webhook/github-webhook.const';
import {
  GithubClient,
  WebhookContext,
} from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import { PlatinumReview } from '../../../../../services/bots/src/github-webhook/handlers/platinum_review';
import {
  fetchIntegrationManifest,
  IntegrationManifest,
} from '../../../../../services/bots/src/github-webhook/utils/integration';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';

jest.mock('../../../../../services/bots/src/github-webhook/utils/integration', () => ({
  ...jest.requireActual('../../../../../services/bots/src/github-webhook/utils/integration'),
  fetchIntegrationManifest: jest.fn(),
}));

const mockedFetchIntegrationManifest = jest.mocked(fetchIntegrationManifest);

const MANIFEST: IntegrationManifest = {
  codeowners: ['@owner'],
  domain: 'awesome',
  name: 'Awesome',
  config_flow: true,
  dependencies: [],
  documentation: 'https://www.home-assistant.io/integrations/awesome',
  requirements: [],
  iot_class: 'cloud_polling',
};

const label = (name: string): Label => ({
  id: 1,
  node_id: 'label',
  url: 'https://api.github.com/labels/1',
  name,
  description: null,
  color: 'ffffff',
  default: false,
});

describe('PlatinumReview', () => {
  let handler: PlatinumReview;
  let context: WebhookContext<PullRequestLabeledEvent>;
  let createCommitStatusWithRetry: jest.Mock;
  let listReviews: jest.Mock;

  beforeEach(() => {
    handler = new PlatinumReview();
    createCommitStatusWithRetry = jest.fn();
    listReviews = jest.fn();

    const platinumLabel = label('Quality Scale: platinum');
    const payload = loadJsonFixture<PullRequestLabeledEvent>('pull_request.opened', {
      action: 'labeled',
      label: platinumLabel,
    });
    payload.pull_request.labels = [platinumLabel, label('integration: awesome')];
    context = mockWebhookContext<PullRequestLabeledEvent>({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload,
      github: { createCommitStatusWithRetry, pulls: { listReviews } } as unknown as GithubClient,
    });
    mockedFetchIntegrationManifest.mockResolvedValue(MANIFEST);
  });

  it('sets pending while waiting for code owner approval', async () => {
    listReviews.mockResolvedValue({
      data: [{ state: 'APPROVED', user: { login: 'someone-else' } }],
    });

    await handler.handle(context);

    expect(createCommitStatusWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'code-owner-approval',
        state: 'pending',
        description: 'Code owner approval required for Platinum integrations before merging',
      }),
    );
  });

  it('sets success after a code owner approves', async () => {
    listReviews.mockResolvedValue({
      data: [{ state: 'APPROVED', user: { login: 'Owner' } }],
    });

    await handler.handle(context);

    expect(createCommitStatusWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'code-owner-approval',
        state: 'success',
        description: 'Code owner approval ok.',
      }),
    );
  });
});
