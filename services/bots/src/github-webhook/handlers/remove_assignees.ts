import { PullRequestSynchronizeEvent } from '@octokit/webhooks-types';
import { EventType, Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

export class RemoveAssignees extends BaseWebhookHandler {
  public allowBots = false;
  public allowedEventTypes = [EventType.PULL_REQUEST_SYNCHRONIZE];
  public allowedRepositories = [Repository.CORE, Repository.HOME_ASSISTANT_IO];

  async handle(context: WebhookContext<PullRequestSynchronizeEvent>) {
    if (context.payload.pull_request.assignees.length > 10) {
      await context.github.issues.update(context.issue({ assignees: [] }));
    }
  }
}
