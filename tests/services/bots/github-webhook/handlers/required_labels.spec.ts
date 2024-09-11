import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import {
  RequiredLabels,
  LabelsToCheck,
} from '../../../../../services/bots/src/github-webhook/handlers/required_labels';
import { loadJsonFixture } from '../../../../utils/fixture';
import { mockWebhookContext } from '../../../../utils/test_context';
import {
  ESPHomeRepository,
  EventType,
  HomeAssistantRepository,
  Repository,
} from '../../../../../services/bots/src/github-webhook/github-webhook.const';

describe('RequiredLabels', () => {
  let handler: RequiredLabels;
  let mockContext: WebhookContext<any>;
  let createCommitStatusCall: any;

  beforeEach(function () {
    handler = new RequiredLabels();
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
    for (const result of ['success', 'failure']) {
      it(`Validate handling ${result} for ${repository} with ${lables}`, async () => {
        mockContext.payload = loadJsonFixture('pull_request.opened', {
          pull_request: { labels: result === 'success' ? [{ name: lables[0] }] : [] },
        });
        mockContext.repository = repository as Repository;
        await handler.handle(mockContext);

        expect(mockContext.github.repos.createCommitStatus).toHaveBeenCalledWith(
          expect.objectContaining({
            context: 'required-labels',
            description: `Has at least one of the required labels (${lables.join(', ')})`,
            state: result,
          }),
        );
      });
    }
  }
});
