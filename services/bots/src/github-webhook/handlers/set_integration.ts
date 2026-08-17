import { Issue, IssuesOpenedEvent } from '@octokit/webhooks-types';
import { entityComponents, EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { extractIntegrationDocumentationLinks } from '../utils/text_parser';
import { BaseWebhookHandler } from './base';

export class SetIntegration extends BaseWebhookHandler {
  public allowBots = false;
  public allowedEventTypes = [EventType.ISSUES_OPENED];
  public allowedRepositories = [
    HomeAssistantRepository.CORE,
    HomeAssistantRepository.HOME_ASSISTANT_IO,
  ];

  async handle(context: WebhookContext<IssuesOpenedEvent>) {
    const links = extractIntegrationDocumentationLinks((context.payload.issue as Issue).body);

    let integrationFound = false;
    for (const link of links) {
      const integration =
        link.platform && entityComponents.has(link.integration) ? link.platform : link.integration;
      const label = `integration: ${integration}`;
      const exist = await context.github.issuesGetLabel(
        context.issue({ name: label, repo: 'core' }),
      );
      if (exist?.name === label) {
        context.scheduleIssueLabel(label);
        integrationFound = true;
      }
    }

    if (!integrationFound && context.repository === HomeAssistantRepository.CORE) {
      const author = (context.payload.issue as Issue).user.login;
      context.scheduleIssueComment({
        handler: 'SetIntegration',
        comment:
          `Hey @${author} :wave:, thanks for opening this issue! ` +
          "We couldn't automatically detect which integration this is about. " +
          'If you know, it would be really helpful if you could set it by commenting:\n\n' +
          '`@home-assistant set-integration <domain>`\n\n' +
          'For example: `@home-assistant set-integration zha`\n' +
          'You can also paste the Home Assistant integration documentation URL.\n\n' +
          'Setting the integration helps route this issue to the right code owner. ' +
          "Don't worry if you're unsure — someone will set it for you, but it may take a bit longer " +
          'for the issue to reach the right maintainer. :heart:',
        priority: 10,
      });
    }
  }
}
