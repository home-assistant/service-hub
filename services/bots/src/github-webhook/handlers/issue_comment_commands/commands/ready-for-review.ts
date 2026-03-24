import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext } from '../const';
import { IssueCommentCommandBase } from './base';

export class ReadyForReviewCommentCommand extends IssueCommentCommandBase {
  command = 'ready-for-review';
  invokerType = 'code_owner';
  pullRequestOnly = true;

  description(context: WebhookContext<any>) {
    return 'Remove the draft status from the pull request.';
  }

  async handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ): Promise<void | false> {
    if (!context.payload.issue.pull_request) {
      throw new Error('This command can only be used on pull requests.');
    }

    const pullRequest = await context.github.pulls.get(context.pullRequest());

    if (!pullRequest.data.draft) {
      return;
    }

    if (!invokerIsCodeOwner(command)) {
      return false;
    }

    await context.markPullRequestReadyForReview(pullRequest.data.node_id);
  }
}
