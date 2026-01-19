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
    if (!context.payload.label || !context.payload.label.name.startsWith('integration: ')) {
      return;
    }

    const author = context.payload.issue.user.login;
    const integration = context.payload.label.name;
    const encodedLabel = encodeURIComponent(integration);
    const defaultMessage = issueContext['_default_message'] || '';
    const issueLink = `https://github.com/home-assistant/core/issues?q=%20label%3A%22${encodedLabel}%22%20`;
    const integrationContext = withIssueContext.includes(integration)
      ? `\n${issueContext[integration]}`
      : '';

    const comment = `@${author} ${defaultMessage}\n\n${issueLink}${integrationContext}`;

    context.scheduleIssueComment({
      handler: 'IssueContext',
      comment,
    });
  }
}
