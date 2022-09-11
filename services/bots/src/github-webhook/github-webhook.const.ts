import { RestEndpointMethodTypes } from '@octokit/rest';
import { EventPayloadMap } from '@octokit/webhooks-types';
import { BaseWebhookHandler } from './handlers/base';

export const WEBHOOK_HANDLERS: BaseWebhookHandler[] = [];

export type PullRequestEventData = EventPayloadMap['pull_request'];
export type ListCommitResponse = RestEndpointMethodTypes['pulls']['listCommits']['response'];
