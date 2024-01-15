import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import {
  BlockingLabels,
  LabelsToCheck,
} from '../../../../../services/bots/src/github-webhook/handlers/blocking_labels';
import { loadJsonFixture } from '../../../../utils/fixture';
import { mockWebhookContext } from '../../../../utils/test_context';
import {
  ESPHomeRepository,
  EventType,
  HomeAssistantRepository,
  Repository,
} from '../../../../../services/bots/src/github-webhook/github-webhook.const';

describe('BlockingLabels', () => {
  let handler: BlockingLabels;
  let mockContext: WebhookContext<any>;
  let createCommitStatusCall: any;

  beforeEach(function () {
    handler = new BlockingLabels();
    createCommitStatusCall = {};
    mockContext = mockWebhookContext({
      payload: loadJsonFixture('pull_request.opened'),
      eventType: EventType.PULL_REQUEST_LABELED,
      // @ts-ignore partial mock
      github: {
        repos: {
          // @ts-ignore partial mock
          createCommitStatus: jest.fn(),
        },
      },
    });
  });

  for (const [repository, lables] of Object.entries(LabelsToCheck)) {
    for (const label of Object.keys(lables)) {
      for (const result of ['success', 'failure']) {
        const description =
          LabelsToCheck[repository][label][result === 'failure' ? 'message' : 'success'] || 'OK';
        it(`Validate handling ${label} for ${repository} with ${result} result (${description})`, async () => {
          mockContext.payload = loadJsonFixture('pull_request.opened', {
            pull_request: { labels: result === 'failure' ? [{ name: label }] : [] },
          });
          mockContext.repository = repository as Repository;
          await handler.handle(mockContext);

          expect(mockContext.github.repos.createCommitStatus).toHaveBeenCalledWith(
            expect.objectContaining({
              context: `blocking-label-${label.toLowerCase().replace(' ', '-')}`,
              description,
              state: result,
            }),
          );
        });
      }
    }
  }
});
