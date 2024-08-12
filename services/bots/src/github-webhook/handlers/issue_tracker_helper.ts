import { IssuesLabeledEvent, PullRequestLabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { issueFromPayload } from '../utils/issue';
import { BaseWebhookHandler } from './base';

const assumeFixedComment = (context: WebhookContext<IssuesLabeledEvent>, author: string) => `
:wave: ${author}, thanks for reporting an issue!

This issue is assumed to be fixed in the latest stable release. Please reopen in case you can still reproduce the issue with the latest stable release. You can find the latest stable release at https://github.com/home-assistant/core/releases/latest`;

const safeModeComment = (context: WebhookContext<IssuesLabeledEvent>, author: string) => `
:wave: ${author}, thanks for reporting an issue!

Could you please try reproducing the issue in [safe mode](https://www.home-assistant.io/blog/2023/11/01/release-202311/#restarting-into-safe-mode) and update the checkbox? This helps us determine if the issue is related to unsupported custom resources and ensures it's within the scope of this issue tracker. Your help is appreciated!`;

const coreIssueComment = (context: WebhookContext<IssuesLabeledEvent>, author: string) => `
:wave: ${author}, thanks for reporting an issue!

It looks like this issue is related to Home Assistant Core. Please check the [Home Assistant Core](https://github.com/home-assistant/core/issues) repository, the issue might have been reported already. Open a new issue in that repository if you can't find a matching issue.`;

const supervisorIssueComment = (context: WebhookContext<IssuesLabeledEvent>, author: string) => `
:wave: ${author}, thanks for reporting an issue!

It looks like this issue is related to Home Assistant Supervisor. Please
check the [Home Assistant Supervisor](https://github.com/home-assistant/supervisor/issues)
repository, the issue might have been reported already. Open a new issue
in that repository if you can't find a matching issue.`;

export class IssueTrackerHelper extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.ISSUES_LABELED];
  public allowedRepositories = [HomeAssistantRepository.FRONTEND];

  async handle(context: WebhookContext<IssuesLabeledEvent>) {
    if (!context.payload.label) {
      return;
    }

    const labelName = context.payload.label.name;

    switch (labelName) {
      case 'assume-fixed': {
        context.scheduleIssueComment({
          handler: 'IssueTrackerHelper',
          comment: assumeFixedComment(context, context.payload.issue.user.login),
          priority: 1,
          close: true,
          close_reason: 'not_planned',
        });
        break;
      }
      case 'core-issue': {
        context.scheduleIssueComment({
          handler: 'IssueTrackerHelper',
          comment: coreIssueComment(context, context.payload.issue.user.login),
          priority: 1,
          close: true,
          close_reason: 'not_planned',
        });
        break;
      }
      case 'supervisor-issue': {
        context.scheduleIssueComment({
          handler: 'IssueTrackerHelper',
          comment: supervisorIssueComment(context, context.payload.issue.user.login),
          priority: 1,
          close: true,
          close_reason: 'not_planned',
        });
        break;
      }
      case 'safe-mode': {
        context.scheduleIssueComment({
          handler: 'IssueTrackerHelper',
          comment: safeModeComment(context, context.payload.issue.user.login),
          priority: 1,
        });
        break;
      }
    }
  }
}
