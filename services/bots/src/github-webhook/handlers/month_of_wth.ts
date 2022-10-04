import fetch from 'node-fetch';

import { PullRequest, PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { EventType, Organization } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { extractForumLinks } from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

const WTH_CATEGORY_ID = 56;

export class MonthOfWTH extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.PULL_REQUEST_OPENED];
  public allowedOrganizations = [Organization.HOME_ASSISTANT];

  async handle(context: WebhookContext<PullRequestOpenedEvent>) {
    for (const link of extractForumLinks((context.payload.pull_request as PullRequest).body)) {
      try {
        const linkData = await (await fetch(`${link}.json`)).json();
        if (linkData.category_id === WTH_CATEGORY_ID) {
          context.scheduleIssueLabel('WTH');
          return;
        }
      } catch (_) {
        // Assume bad link
      }
    }
  }
}
