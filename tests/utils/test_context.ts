import deepmerge from 'deepmerge';
import { WebhookContext } from '../../services/bots/src/github-webhook/github-webhook.model';
import { loadJsonFixture } from './fixture';

export class MockWebhookContext extends WebhookContext<any> {}

export const mockWebhookContext = <T>(params: Partial<WebhookContext<T>>): WebhookContext<T> =>
  new WebhookContext<T>({
    //@ts-ignore
    github: deepmerge(
      {
        reactions: {
          createForIssueComment: jest.fn(),
        },
        issues: {
          update: jest.fn(),
          removeLabel: jest.fn(),
          removeAssignees: jest.fn(),
        },
        teams: {
          listMembersInOrg: jest.fn(),
        }
      },
      { ...params?.github },
    ),
    payload: (params.payload as T) || loadJsonFixture<T>(params.eventType),
    eventType: params.eventType,
  });
