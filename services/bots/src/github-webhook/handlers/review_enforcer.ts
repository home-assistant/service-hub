import { PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { ParsedDocsPath } from '../utils/parse_docs_path';
import { ParsedPath } from '../utils/parse_path';
import { fetchPullRequestFilesFromContext } from '../utils/pull_request';
import { BaseWebhookHandler } from './base';

const INTEGRATIONS = new Set(['xiaomi_miio']);
const USERS = new Set([]);

export class ReviewEnforcer extends BaseWebhookHandler {
  async handle(context: WebhookContext<PullRequestOpenedEvent>) {
    if (context.senderIsBot || context.eventType !== 'pull_request.opened') {
      return;
    }
    const repositoryName = context.repo().repo as Repository;
    if (USERS.has(context.payload.sender.login)) {
      context.scheduleIssueComment(
        'ReviewEnforcer',
        'This pull request needs to be manually signed off by @home-assistant/core before it can get merged.',
      );
    } else if ([Repository.HOME_ASSISTANT_IO, Repository.CORE].includes(repositoryName)) {
      const files = await fetchPullRequestFilesFromContext(context);
      const parsed = files.map((file) =>
        repositoryName === Repository.HOME_ASSISTANT_IO
          ? new ParsedDocsPath(file)
          : new ParsedPath(file),
      );

      if (parsed.some((file) => file.component && INTEGRATIONS.has(file.component))) {
        context.scheduleIssueComment(
          'ReviewEnforcer',
          'This pull request needs to be manually signed off by @home-assistant/core before it can get merged.',
        );
      }
    }
  }
}
