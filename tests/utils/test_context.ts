import { WebhookContext } from '../../services/bots/src/github-webhook/github-webhook.model';
import { loadJsonFixture } from './fixture';

export class MockWebhookContext extends WebhookContext<any> {}

export const mockWebhookContext = (params: Partial<WebhookContext<any>>): WebhookContext<any> =>
  new WebhookContext({
    // @ts-ignore
    github: { ...params?.github },
    payload: params.payload || loadJsonFixture(params.eventType),
    eventType: params.eventType,
  });
