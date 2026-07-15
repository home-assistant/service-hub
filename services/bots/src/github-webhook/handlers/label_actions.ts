import { IssuesLabeledEvent } from '@octokit/webhooks-types';
import findUp from 'find-up';
import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import { join } from 'path';
import { EventType, Repository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

interface LabelAction {
  comment: string;
  close?: boolean;
  closeReason?: 'completed' | 'not_planned';
}

interface LabelActionsConfig {
  actions: Record<string, LabelAction>;
  repositories: Record<string, string[]>;
}

const dataDirectory = findUp.sync('data', { cwd: __filename, type: 'directory' });
export const labelActionsConfig = yaml.load(
  readFileSync(join(dataDirectory, 'github', 'label_actions.yaml')).toString(),
  {
    json: true,
  },
) as LabelActionsConfig;

export class LabelActions extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.ISSUES_LABELED];
  public allowedRepositories = Object.keys(labelActionsConfig.repositories) as Repository[];

  async handle(context: WebhookContext<IssuesLabeledEvent>) {
    if (!context.payload.label) {
      return;
    }

    const labelName = context.payload.label.name;
    if (!labelActionsConfig.repositories[context.repository]?.includes(labelName)) {
      return;
    }

    const action = labelActionsConfig.actions[labelName];
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
