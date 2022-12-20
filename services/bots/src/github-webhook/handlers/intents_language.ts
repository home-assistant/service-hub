import { PullRequestOpenedEvent, PullRequestSynchronizeEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { fetchPullRequestFilesFromContext } from '../utils/pull_request';
import { BaseWebhookHandler } from './base';

const LanguageFileRegex =
  /(?<section>sentences|responses|tests)\/(?<language_code>[a-z]{2})\/(?<intent>.+)\.yaml/;

export class SetIntentsLanguage extends BaseWebhookHandler {
  public allowBots = false;
  public allowedRepositories = [HomeAssistantRepository.INTENTS];
  public allowedEventTypes = [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_SYNCHRONIZE];

  async handle(context: WebhookContext<PullRequestOpenedEvent | PullRequestSynchronizeEvent>) {
    const files = await fetchPullRequestFilesFromContext(context);

    for (const file of files) {
      const parsed = LanguageFileRegex.exec(file.filename);
      if (parsed?.groups?.language_code) {
        context.scheduleIssueLabel(`language: ${parsed.groups.language_code}`);
      }
      if (parsed?.groups?.section) {
        context.scheduleIssueLabel(`type: ${parsed.groups.section}`);
      }
    }
  }
}
