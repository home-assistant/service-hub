import { RestEndpointMethodTypes } from '@octokit/rest';
import { EventPayloadMap } from '@octokit/webhooks-types';
import { BaseWebhookHandler } from './handlers/base';

export type PullRequestEventData = EventPayloadMap['pull_request'];
export type ListCommitResponse = RestEndpointMethodTypes['pulls']['listCommits']['response'];

export interface WebhookHandlerParams {
  eventType: string;
  deliveryId: string;
  payload: Record<string, any>;
}

export const WEBHOOK_HANDLERS: BaseWebhookHandler[] = [];
export const ISSUE_UPDATES: {
  [deliveryId: string]: {
    owner: string;
    repo: string;
    issue_number: number;
    labels: string[];
    comments: { context: string; comment: string }[];
  };
} = {};

export const scheduleIssueLabel = (deliveryId: string, label: string) =>
  ISSUE_UPDATES[deliveryId].labels.push(label);

export const scheduleIssueComment = (deliveryId: string, context: string, comment: string) =>
  ISSUE_UPDATES[deliveryId].comments.push({ context, comment });
