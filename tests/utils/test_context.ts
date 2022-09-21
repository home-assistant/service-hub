import { WebhookContext } from '../../services/bots/src/github-webhook/github-webhook.model';

export class MockWebhookContext extends WebhookContext<any> {}

export const mockWebhookContext = (params?: Partial<WebhookContext<any>>): WebhookContext<any> =>
  new WebhookContext({
    // @ts-ignore
    github: { ...params?.github },
    payload: {
      repository: { name: 'core', owner: { login: 'home-assistant' } },
      sender: { type: 'user', login: 'test-developer#1337' },
      number: 1337,
      ...params?.payload,
    },
    eventType: params?.eventType || '',
  });
