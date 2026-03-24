import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext } from '../const';
import { IssueCommentCommandBase } from './base';

export class MarkDraftCommentCommand extends IssueCommentCommandBase {
  command = 'mark-draft';
  invokerType = 'code_owner';
  pullRequestOnly = true;

  description(context: WebhookContext<any>) {
    return 'Mark the pull request as draft.';
  }

  async handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
    if (!context.payload.issue.pull_request) {
      throw new Error('This command can only be used on pull requests.');
    }

    if (!invokerIsCodeOwner(command)) {
      throw new Error('Only code owners can mark a pull request as draft.');
    }

    const pullRequest = await context.github.pulls.get(context.pullRequest());

    if (pullRequest.data.draft) {
      throw new Error('The pull request is already a draft.');
    }

    await context.convertPullRequestToDraft(pullRequest.data.node_id);
  }
}
