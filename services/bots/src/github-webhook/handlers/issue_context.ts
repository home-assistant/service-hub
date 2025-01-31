import { IssuesLabeledEvent } from '@octokit/webhooks-types';
import findUp from 'find-up';
import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import { join } from 'path';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

const dataDirectory = findUp.sync('data', { cwd: __filename, type: 'directory' });
const issueContext = yaml.load(
  readFileSync(join(dataDirectory, 'github', 'issue_context.yaml')).toString(),
  {
    json: true,
  },
) as Record<string, string>;
const withIssueContext = Object.keys(issueContext);

export class IssueContext extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.ISSUES_LABELED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  async handle(context: WebhookContext<IssuesLabeledEvent>) {
    if (!context.payload.label || !withIssueContext.includes(context.payload.label.name)) {
      return;
    }
    context.scheduleIssueComment({
      handler: 'IssueContext',
      comment: issueContext[context.payload.label.name],
    });
  }
}
