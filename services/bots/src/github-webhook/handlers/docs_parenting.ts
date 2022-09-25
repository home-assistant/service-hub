import {
  PullRequestClosedEvent,
  PullRequestEditedEvent,
  PullRequestOpenedEvent,
  PullRequestReopenedEvent,
} from '@octokit/webhooks-types';
import { EventType, HOME_ASSISTANT_ORG, Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import {
  extractIssuesOrPullRequestMarkdownLinks,
  extractPullRequestURLLinks,
} from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

export class DocsParenting extends BaseWebhookHandler {
  public allowedEventTypes = [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_CLOSED,
    EventType.PULL_REQUEST_EDITED,
  ];
  public allowedRepositories = [Repository.CORE, Repository.HOME_ASSISTANT_IO, Repository.FRONTEND];

  async handle(
    context: WebhookContext<
      | PullRequestReopenedEvent
      | PullRequestOpenedEvent
      | PullRequestEditedEvent
      | PullRequestClosedEvent
    >,
  ) {
    if (
      [EventType.PULL_REQUEST_REOPENED, EventType.PULL_REQUEST_CLOSED].includes(context.eventType)
    ) {
      updateDocsParentStatus(
        context as WebhookContext<PullRequestReopenedEvent | PullRequestClosedEvent>,
      );
    } else {
      if (context.repositoryName === Repository.HOME_ASSISTANT_IO) {
        await runDocsParentingDocs(
          context as WebhookContext<PullRequestOpenedEvent | PullRequestEditedEvent>,
        );
      } else {
        await runDocsParentingNonDocs(
          context as WebhookContext<PullRequestOpenedEvent | PullRequestEditedEvent>,
        );
      }
    }
  }
}

// Deal with PRs on Home Assistant Python repo
const runDocsParentingNonDocs = async (
  context: WebhookContext<PullRequestOpenedEvent | PullRequestEditedEvent>,
) => {
  const linksToDocs = extractIssuesOrPullRequestMarkdownLinks(context.payload.pull_request.body)
    .concat(extractPullRequestURLLinks(context.payload.pull_request.body))
    .filter((link) => link.repo === Repository.HOME_ASSISTANT_IO);

  if (linksToDocs.length === 0) {
    return;
  }

  if (linksToDocs.length > 2) {
    return;
  }

  linksToDocs.forEach(
    async (link) =>
      await context.github.issues.addLabels({
        owner: link.owner,
        repo: link.repo,
        issue_number: link.number,
        labels: ['has-parent'],
      }),
  );
};

// Deal with PRs on Home Assistant.io repo
const runDocsParentingDocs = async (
  context: WebhookContext<PullRequestOpenedEvent | PullRequestEditedEvent>,
) => {
  const linksToNonDocs = extractIssuesOrPullRequestMarkdownLinks(context.payload.pull_request.body)
    .concat(extractPullRequestURLLinks(context.payload.pull_request.body))
    .filter(
      (link) => link.owner === HOME_ASSISTANT_ORG && link.repo !== Repository.HOME_ASSISTANT_IO,
    );

  if (linksToNonDocs.length === 0) {
    return;
  }

  context.scheduleIssueLabel('has-parent');
};

/**
 * Goal is to reflect the parent status on the docs PR.
 *  - parent opened: make sure docs PR is open
 *  - parent closed: make sure docs PR is closed
 *  - parent merged: add label "parent-merged"
 */
const updateDocsParentStatus = async (
  context: WebhookContext<PullRequestReopenedEvent | PullRequestClosedEvent>,
) => {
  if (context.repositoryName === Repository.HOME_ASSISTANT_IO) {
    return;
  }

  const linksToDocs = extractIssuesOrPullRequestMarkdownLinks(
    context.payload.pull_request.body,
  ).filter((link) => link.repo === Repository.HOME_ASSISTANT_IO);

  if (linksToDocs.length !== 1) {
    return;
  }

  const docLink = linksToDocs[0];
  const parentState = getPRState(context.payload.pull_request);

  if (parentState === 'open') {
    // Parent is open, docs issue should be open too.
    const docsPR = await context.fetchPullRequestWithCache({
      owner: docLink.owner,
      repo: docLink.repo,
      pull_number: docLink.number,
    });
    const docsPRState = getPRState(docsPR);

    if (['open', 'merged'].includes(docsPRState)) {
      return;
    }

    // docs PR state == closed
    await context.github.pulls.update({
      owner: docLink.owner,
      repo: docLink.repo,
      pull_number: docLink.number,
      state: 'open',
    });
    return;
  }

  if (parentState === 'closed') {
    await context.github.pulls.update({
      owner: docLink.owner,
      repo: docLink.repo,
      pull_number: docLink.number,
      state: 'closed',
    });
    return;
  }

  // Parent state == merged
  context.scheduleIssueLabel('parent-merged');
};

const getPRState = (pr: { state: string; merged: boolean }) =>
  pr.state === 'open' ? 'open' : pr.merged ? 'merged' : 'closed';
