import { PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { fetchPullRequestFilesFromContext } from '../utils/pull_request';
import { BaseWebhookHandler } from './base';

const DEPENDENCY_FILES = new Set([
  'setup.py',
  'manifest.json',
  'package_constraints.txt',
  'requirements_all.txt',
  'requirements_docs.txt',
  'requirements_test.txt',
  'requirements_test_all.txt',
]);

export class DependencyBump extends BaseWebhookHandler {
  public allowBots = false;
  public allowedEventTypes = [EventType.PULL_REQUEST_OPENED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  async handle(context: WebhookContext<PullRequestOpenedEvent>) {
    const files = await fetchPullRequestFilesFromContext(context);

    const filenames = files.map((file) => {
      const parts = file.filename.split('/');
      return parts[parts.length - 1];
    });

    if (!filenames.every((filename: string) => DEPENDENCY_FILES.has(filename))) {
      return;
    }

    context.scheduleIssueLabel('dependency-bump');
  }
}
