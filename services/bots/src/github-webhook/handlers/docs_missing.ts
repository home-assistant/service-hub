import {
  PullRequestLabeledEvent,
  PullRequestSynchronizeEvent,
  PullRequestUnlabeledEvent,
} from '@octokit/webhooks-types';
import { EventType, Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import {
  extractIssuesOrPullRequestMarkdownLinks,
  extractPullRequestURLLinks,
} from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

export class DocsMissing extends BaseWebhookHandler {
  public allowedEventTypes = [
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
  ];
  public allowedRepositories = [Repository.CORE];

  async handle(
    context: WebhookContext<
      PullRequestLabeledEvent | PullRequestUnlabeledEvent | PullRequestSynchronizeEvent
    >,
  ) {
    const currentLabels = new Set(context.payload.pull_request.labels.map((label) => label.name));

    let needsDocumentation = currentLabels.has('docs-missing');

    if (
      !needsDocumentation &&
      (currentLabels.has('new-integration') || currentLabels.has('new-platform'))
    ) {
      const linksToDocs = extractIssuesOrPullRequestMarkdownLinks(context.payload.pull_request.body)
        .concat(extractPullRequestURLLinks(context.payload.pull_request.body))
        .filter((link) => link.repo === Repository.HOME_ASSISTANT_IO);

      needsDocumentation = linksToDocs.length === 0;
    }

    await context.github.repos.createCommitStatus(
      context.repo({
        sha: context.payload.pull_request.head.sha,
        context: 'docs-missing',
        state: needsDocumentation ? 'failure' : 'success',
        description: needsDocumentation ? `Please open a documentation PR.` : `Documentation ok.`,
      }),
    );
  }
}
