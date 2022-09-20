import { RestEndpointMethodTypes } from '@octokit/rest';
import { EventPayloadMap } from '@octokit/webhooks-types';
import { BaseWebhookHandler } from './handlers/base';

export const WEBHOOK_HANDLERS: BaseWebhookHandler[] = [];

export type PullRequestEventData = EventPayloadMap['pull_request'];
export type IssuesEventData = EventPayloadMap['issues'];
export type ListCommitResponse = RestEndpointMethodTypes['pulls']['listCommits']['response'];

export enum Repository {
  CORE = 'core',
  HOME_ASSISTANT_IO = 'home-assistant.io',
}
