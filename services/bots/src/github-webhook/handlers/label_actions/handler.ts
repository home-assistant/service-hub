import { IssuesLabeledEvent } from '@octokit/webhooks-types';
import { EventType, Repository } from '../../github-webhook.const';
import { WebhookContext } from '../../github-webhook.model';
import { BaseWebhookHandler } from '../base';
import { repositoryLabelActions } from './const';

export class LabelActions extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.ISSUES_LABELED];
  public allowedRepositories = Object.keys(repositoryLabelActions) as Repository[];

  async handle(context: WebhookContext<IssuesLabeledEvent>) {
    if (!context.payload.label) {
      return;
    }

    const action = repositoryLabelActions[context.repository]?.[context.payload.label.name];
    if (!action) {
      return;
    }

    if (action.comment) {
      context.scheduleIssueComment({
        handler: 'LabelActions',
        comment: action.comment
          .replace(/{issue-author}/g, context.payload.issue.user.login)
          .replace(/{repository}/g, context.repository),
      });
    }

    if (action.close && context.payload.issue.state === 'open') {
      await context.github.issues.update(
        context.issue({
          state: 'closed',
          state_reason: action.closeReason,
        }),
      );
    }
  }
}
