import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { invokerIsCodeOwner, IssueCommentCommandContext } from '../const';
import { IssueCommentCommandBase } from './base';

export class UpdateBranchCommentCommand extends IssueCommentCommandBase {
  command = 'update-branch';
  invokerType = 'code_owner';
  pullRequestOnly = true;

  description(context: WebhookContext<any>) {
    return 'Update the pull request branch with the base branch.';
  }

  async handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
    if (!context.payload.issue.pull_request) {
      throw new Error('This command can only be used on pull requests.');
    }

    if (!invokerIsCodeOwner(command)) {
      throw new Error('Only code owners can update the branch.');
    }

    try {
      await context.github.pulls.updateBranch(context.pullRequest());
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Unknown error';
      await context.github.issues.createComment(
        context.issue({
          body: `Failed to update branch: ${message}`,
        }),
      );
      throw err;
    }
  }
}
