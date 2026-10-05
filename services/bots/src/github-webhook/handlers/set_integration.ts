import { Issue, IssuesOpenedEvent } from '@octokit/webhooks-types';
import { entityComponents, EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { markdownParser } from '../utils/markdown';
import { extractIntegrationDocumentationLinks } from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

const INTEGRATION_NAME_SECTION_TITLE = 'Integration causing the issue';
// GitHub issue forms render empty optional fields with this placeholder
const NO_RESPONSE = '_No response_';

export const slugifyIntegrationName = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export class SetIntegration extends BaseWebhookHandler {
  public allowBots = false;
  public allowedEventTypes = [EventType.ISSUES_OPENED];
  public allowedRepositories = [
    HomeAssistantRepository.CORE,
    HomeAssistantRepository.HOME_ASSISTANT_IO,
  ];

  async handle(context: WebhookContext<IssuesOpenedEvent>) {
    const body = (context.payload.issue as Issue).body || '';
    let labelAdded = false;

    for (const link of extractIntegrationDocumentationLinks(body)) {
      const integration =
        link.platform && entityComponents.has(link.integration) ? link.platform : link.integration;
      labelAdded = (await this.addIntegrationLabel(context, integration)) || labelAdded;
    }

    // Only the core issue form has an integration name field
    if (labelAdded || context.repository !== HomeAssistantRepository.CORE) {
      return;
    }

    // Fall back to the integration name from the issue form if no link resolved to a label
    const integrationName = markdownParser(body, { ignoreComments: true }).find(
      (section) => section.title === INTEGRATION_NAME_SECTION_TITLE,
    )?.text;
    if (!integrationName || integrationName === NO_RESPONSE) {
      return;
    }

    const integration = slugifyIntegrationName(integrationName);
    if (integration) {
      await this.addIntegrationLabel(context, integration);
    }
  }

  private async addIntegrationLabel(
    context: WebhookContext<IssuesOpenedEvent>,
    integration: string,
  ): Promise<boolean> {
    const label = `integration: ${integration}`;
    const exist = await context.github.issuesGetLabel(context.issue({ name: label, repo: 'core' }));
    if (exist?.name === label) {
      context.scheduleIssueLabel(label);
      return true;
    }
    return false;
  }
}
