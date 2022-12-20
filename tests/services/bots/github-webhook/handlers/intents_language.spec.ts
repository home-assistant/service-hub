import * as assert from 'assert';
// @ts-ignore
import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model.ts';
import { SetIntentsLanguage } from '../../../../../services/bots/src/github-webhook/handlers/intents_language';
import { mockWebhookContext } from '../../../../utils/test_context';
import { EventType } from '../../../../../services/bots/src/github-webhook/github-webhook.const';

describe('SetIntentsLanguage', () => {
  let handler: SetIntentsLanguage;
  let mockContext: WebhookContext<any>;
  let getLabelResponse: any;

  beforeEach(function () {
    handler = new SetIntentsLanguage();
    getLabelResponse = {};
    mockContext = mockWebhookContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      github: {
        // @ts-expect-error not a full mock
        issues: {},
      },
    });
  });

  it('works', async () => {
    mockContext._prFilesCache = [
      {
        filename: 'sentences/nb/AwesomeIntent.yaml',
      },
      {
        filename: 'responses/nl/AwesomeIntent.yaml',
      },
      {
        filename: 'tests/fr/AwesomeIntent.yaml',
      },
    ];
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, [
      'lang: nb',
      'lang: nl',
      'lang: fr',
    ]);
  });
});
