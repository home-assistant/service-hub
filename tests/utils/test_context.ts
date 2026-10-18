import deepmerge from 'deepmerge';
import { WebhookContext } from '../../services/bots/src/github-webhook/github-webhook.model';
import { loadJsonFixture } from './fixture';

export class MockWebhookContext extends WebhookContext<any> {}

export const mockWebhookContext = <T>(params: Partial<WebhookContext<T>>): WebhookContext<T> =>
  new WebhookContext<T>({
    //@ts-ignore
    github: deepmerge(
      {
        graphql: jest.fn(),
        // Delegate to the wrapped method so callers can keep mocking listX with `{ data: [...] }`.
        paginate: jest.fn().mockImplementation(async (method: any, params: any) => {
          const result = await method(params);
          return result?.data ?? [];
        }),
        pulls: {
          get: jest.fn(),
          updateBranch: jest.fn(),
        },
        reactions: {
          createForIssueComment: jest.fn(),
        },
        issues: {
          createComment: jest.fn(),
          update: jest.fn(),
          removeLabel: jest.fn(),
          addLabels: jest.fn(),
          removeAssignees: jest.fn(),
        },
        teams: {
          listMembersInOrg: jest.fn(),
        },
      },
      { ...params?.github },
    ),
    payload: (params.payload as T) || loadJsonFixture<T>(params.eventType),
    eventType: params.eventType,
  });
