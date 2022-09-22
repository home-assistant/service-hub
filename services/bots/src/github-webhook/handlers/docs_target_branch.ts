import { PullRequestEditedEvent, PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { HOME_ASSISTANT_ORG, Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import {
  extractIssuesOrPullRequestMarkdownLinks,
  extractPullRequestURLLinks,
} from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

const IGNORE_REPOS = [Repository.BRANDS, Repository.DEVELOPERS_HOME_ASSISTANT];

export const bodyShouldTargetCurrent: string =
  'It seems that this PR is targeted against an incorrect branch. Documentation updates which apply to our current stable release should target the `current` branch. Please change the target branch of this PR to `current` and rebase if needed. If this is documentation for a new feature, please add a link to that PR in your description.';
export const bodyShouldTargetNext: string =
  'It seems that this PR is targeted against an incorrect branch since it has a parent PR on one of our codebases. Documentation that needs to be updated for an upcoming release should target the `next` branch. Please change the target branch of this PR to `next` and rebase if needed.';

export class DocsTargetBranch extends BaseWebhookHandler {
  async handle(context: WebhookContext<PullRequestOpenedEvent | PullRequestEditedEvent>) {
    if (
      context.senderIsBot ||
      !['pull_request.opened', 'pull_request.edited'].includes(context.eventType) ||
      context.repo().repo !== Repository.HOME_ASSISTANT_IO
    ) {
      return;
    }

    const target = context.payload.pull_request.base.ref;
    const links = extractIssuesOrPullRequestMarkdownLinks(context.payload.pull_request.body).concat(
      extractPullRequestURLLinks(context.payload.pull_request.body).filter(
        (link) =>
          !IGNORE_REPOS.includes(link.repo as Repository) || HOME_ASSISTANT_ORG !== link.owner,
      ),
    );

    if (links.length === 0) {
      if (target !== 'current') {
        await wrongTargetBranchDetected(context, 'current');
      } else {
        await correctTargetBranchDetected(context);
      }
      return;
    }

    if (target !== 'next') {
      await wrongTargetBranchDetected(context, 'next');
    } else {
      await correctTargetBranchDetected(context);
    }
  }
}

const correctTargetBranchDetected = async (
  context: WebhookContext<PullRequestOpenedEvent | PullRequestEditedEvent>,
) => {
  const author = context.payload.sender.login;
  const currentLabels = context.payload.pull_request.labels.map((label) => label.name);
  if (currentLabels.includes('needs-rebase')) {
    await context.github.issues.removeLabel(context.issue({ name: 'needs-rebase' }));
  }

  const currentAssignees = context.payload.pull_request.assignees.map((assignee) => assignee.login);
  if (currentAssignees.includes(author)) {
    await context.github.issues.removeAssignees(context.issue({ assignees: [author] }));
  }
};

const wrongTargetBranchDetected = async (
  context: WebhookContext<PullRequestOpenedEvent | PullRequestEditedEvent>,
  correctTargetBranch: 'current' | 'next',
) => {
  const author = context.payload.sender.login;
  const body: string =
    correctTargetBranch === 'next' ? bodyShouldTargetNext : bodyShouldTargetCurrent;

  const currentLabels = context.payload.pull_request.labels.map((label) => label.name);
  if (currentLabels.includes('needs-rebase')) {
    // If the label "needs-rebase" already exists we can assume that this action has run, and we should ignore it.
    return;
  }

  ['needs-rebase', 'in-progress'].forEach((label) => context.scheduleIssueLabel(label));

  await context.github.issues.addAssignees(context.issue({ assignees: [author] }));
  context.scheduleIssueComment({
    handler: 'DocsTargetBranch',
    comment: correctTargetBranch === 'next' ? bodyShouldTargetNext : bodyShouldTargetCurrent,
  });
};
