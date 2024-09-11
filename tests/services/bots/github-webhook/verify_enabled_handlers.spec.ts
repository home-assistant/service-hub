import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as assert from 'assert';
import {
  EventType,
  WEBHOOK_HANDLERS,
} from '../../../../services/bots/src/github-webhook/github-webhook.const';
import { GithubWebhookService } from '../../../../services/bots/src/github-webhook/github-webhook.service';
import { GithubWebhookModule } from '../../../../services/bots/src/github-webhook/github-webhook.module';

describe('GithubWebhookModule', () => {
  let module: TestingModule;
  let service: GithubWebhookService;
  const invokedHandlers = new Set([]);

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        GithubWebhookModule,
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [
            () => ({ github: { appId: '123', installationId: '122345', keyContents: 'abc' } }),
          ],
        }),
      ],
      providers: [],
    }).compile();
    service = module.get<GithubWebhookService>(GithubWebhookService);
    WEBHOOK_HANDLERS.map((handler) => {
      handler.handle = async () => {
        invokedHandlers.add(handler.constructor.name);
      };
    });
  });

  for (const entry of [
    {
      eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
      handlers: ['PlatinumReview', 'ReviewDrafter'],
      payload: {
        repository: { full_name: 'home-assistant/core', owner: { login: 'home-assistant' } },
      },
    },
    {
      eventType: EventType.ISSUES_OPENED,
      handlers: ['SetIntegration'],
      payload: {
        repository: { full_name: 'home-assistant/core', owner: { login: 'home-assistant' } },
      },
    },
    {
      eventType: EventType.ISSUE_COMMENT_CREATED,
      handlers: ['IssueCommentCommands'],
      payload: {
        repository: { full_name: 'home-assistant/core', owner: { login: 'home-assistant' } },
      },
    },
    {
      eventType: EventType.ISSUES_LABELED,
      handlers: ['CodeOwnersMention', 'IssueLinks'],
      payload: {
        repository: { full_name: 'home-assistant/core', owner: { login: 'home-assistant' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
      handlers: ['ReviewDrafter'],
      payload: {
        repository: { full_name: 'home-assistant/core', owner: { login: 'home-assistant' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_OPENED,
      handlers: [
        'DependencyBump',
        'DocsParenting',
        'Hacktoberfest',
        'LabelBot',
        'MergeConflictChecker',
        'MonthOfWTH',
        'PlatinumReview',
        'ValidateCla',
      ],
      payload: {
        repository: { full_name: 'home-assistant/core', owner: { login: 'home-assistant' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_EDITED,
      handlers: ['DocsMissing', 'DocsParenting'],
      payload: {
        repository: { full_name: 'home-assistant/core', owner: { login: 'home-assistant' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_REOPENED,
      handlers: ['DocsParenting', 'PlatinumReview', 'ValidateCla'],
      payload: {
        repository: { full_name: 'home-assistant/core', owner: { login: 'home-assistant' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      handlers: [
        'DocsMissing',
        'MergeConflictChecker',
        'PlatinumReview',
        'RequiredLabels',
        'ValidateCla',
      ],
      payload: {
        repository: { full_name: 'home-assistant/core', owner: { login: 'home-assistant' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_UNLABELED,
      handlers: ['BlockingLabels', 'DocsMissing', 'RequiredLabels', 'PlatinumReview'],
      payload: {
        repository: { full_name: 'home-assistant/core', owner: { login: 'home-assistant' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_LABELED,
      handlers: [
        'BlockingLabels',
        'CodeOwnersMention',
        'DocsMissing',
        'NewIntegrationsHandler',
        'PlatinumReview',
        'QualityScaleLabeler',
        'RequiredLabels',
        'ValidateCla',
      ],
      payload: {
        repository: { full_name: 'home-assistant/core', owner: { login: 'home-assistant' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_UNLABELED,
      handlers: [],
      payload: {
        repository: {
          full_name: 'home-assistant/home-assistant.io',
          owner: { login: 'home-assistant' },
        },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_LABELED,
      handlers: ['CodeOwnersMention', 'ValidateCla'],
      payload: {
        repository: {
          full_name: 'home-assistant/home-assistant.io',
          owner: { login: 'home-assistant' },
        },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_UNLABELED,
      handlers: ['BlockingLabels'],
      payload: {
        repository: {
          full_name: 'home-assistant/frontend',
          owner: { login: 'home-assistant' },
        },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_LABELED,
      handlers: ['BlockingLabels', 'ValidateCla'],
      payload: {
        repository: {
          full_name: 'home-assistant/frontend',
          owner: { login: 'home-assistant' },
        },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
      handlers: ['ReviewDrafter'],
      payload: {
        repository: { full_name: 'esphome/esphome', owner: { login: 'esphome' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_OPENED,
      handlers: ['MergeConflictChecker'],
      payload: {
        repository: { full_name: 'esphome/esphome', owner: { login: 'esphome' } },
      },
    },
    {
      eventType: EventType.ISSUES_OPENED,
      handlers: [],
      payload: {
        repository: { full_name: 'esphome/esphome', owner: { login: 'esphome' } },
      },
    },
    {
      eventType: EventType.ISSUES_LABELED,
      handlers: [],
      payload: {
        repository: { full_name: 'esphome/esphome', owner: { login: 'esphome' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
      handlers: ['ReviewDrafter'],
      payload: {
        repository: { full_name: 'esphome/esphome', owner: { login: 'esphome' } },
      },
    },
    {
      eventType: EventType.ISSUE_COMMENT_CREATED,
      handlers: [],
      payload: {
        repository: { full_name: 'esphome/esphome', owner: { login: 'esphome' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_EDITED,
      handlers: [],
      payload: {
        repository: { full_name: 'esphome/esphome', owner: { login: 'esphome' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_REOPENED,
      handlers: [],
      payload: {
        repository: { full_name: 'esphome/esphome', owner: { login: 'esphome' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      handlers: ['MergeConflictChecker'],
      payload: {
        repository: { full_name: 'esphome/esphome', owner: { login: 'esphome' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_UNLABELED,
      handlers: [],
      payload: {
        repository: { full_name: 'esphome/esphome', owner: { login: 'esphome' } },
      },
    },
    {
      eventType: EventType.PULL_REQUEST_LABELED,
      handlers: [],
      payload: {
        repository: { full_name: 'esphome/esphome', owner: { login: 'esphome' } },
      },
    },
  ] as {
    eventType: EventType;
    payload: Record<string, any>;
    handlers: string[];
  }[]) {
    it(`Verify handlers for context - ${entry.eventType} ${JSON.stringify(entry.payload)} ${
      entry.handlers.length
    }`, async () => {
      invokedHandlers.clear();
      const [eventType, eventAction] = entry.eventType.split('.');
      await service.handleWebhook(
        { 'x-github-event': eventType },
        {
          ...entry.payload,
          action: eventAction,
          sender: { type: 'User', ...entry.payload.sender },
        },
      );
      assert.deepStrictEqual(new Set(entry.handlers), invokedHandlers);
    });
  }
});
