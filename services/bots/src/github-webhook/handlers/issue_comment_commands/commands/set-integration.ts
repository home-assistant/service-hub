import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { entityComponents } from '../../../github-webhook.const';
import { WebhookContext } from '../../../github-webhook.model';
import { fetchIntegrationManifest } from '../../../utils/integration';
import { extractIntegrationDocumentationLinks } from '../../../utils/text_parser';
import { invokerIsCodeOwner, IssueCommentCommandContext } from '../const';
import { IssueCommentCommandBase } from './base';

const USAGE_HINT = [
  'Example: `@home-assistant set-integration zha`',
  'You can also paste the Home Assistant integration documentation URL.',
].join('\n');

function parseIntegrationFromInput(input: string): string | undefined {
  const links = extractIntegrationDocumentationLinks(input);
  if (links.length > 0) {
    const link = links[0];
    return link.platform && entityComponents.has(link.integration)
      ? link.platform
      : link.integration;
  }

  const trimmed = input.trim();

  // Support dot-separated entity platforms like "sensor.awesome" or "awesome.sensor"
  const dotParts = trimmed.split('.');
  if (dotParts.length === 2) {
    const [first, second] = dotParts;
    if (entityComponents.has(first) && /^\w+$/.test(second)) {
      return second;
    }
    if (entityComponents.has(second) && /^\w+$/.test(first)) {
      return first;
    }
  }

  if (/^\w+$/.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

export class SetIntegrationCommentCommand extends IssueCommentCommandBase {
  command = 'set-integration';
  exampleAdditional = 'zha';
  requireAdditional = false;

  description(_context: WebhookContext<any>) {
    return 'Set the integration label on an issue.';
  }

  async handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ): Promise<boolean> {
    if (context.payload.issue.pull_request) {
      throw new Error('This command can only be used on issues.');
    }

    const integration = command.additional
      ? parseIntegrationFromInput(command.additional.toLowerCase())
      : undefined;
    const oldIntegrationLabels = command.currentLabels.filter((l) => l.startsWith('integration: '));

    // Check permissions first, so only authorized users get feedback comments
    if (!(await this.invokerIsAllowed(context, command, oldIntegrationLabels, integration))) {
      throw new Error('Only the issue author and code owners can use this command.');
    }

    if (!integration) {
      const reason = command.additional
        ? 'Could not determine the integration from the provided input.'
        : 'Please provide an integration domain or documentation link.';
      await context.github.issues.createComment(
        context.issue({ body: `${reason}\n${USAGE_HINT}` }),
      );
      throw new Error('Could not parse integration.');
    }

    const label = `integration: ${integration}`;
    if (command.currentLabels.includes(label)) {
      throw new Error('Label already set.');
    }

    const exist = await context.github.issuesGetLabel(context.issue({ name: label, repo: 'core' }));
    if (exist?.name !== label) {
      await context.github.issues.createComment(
        context.issue({
          body: `The integration \`${integration}\` was not found.\n${USAGE_HINT}`,
        }),
      );
      throw new Error('Integration not found.');
    }

    // Add before removing, so a failure never leaves the issue without an integration label
    await context.github.issues.addLabels(context.issue({ labels: [label] }));
    for (const oldLabel of oldIntegrationLabels) {
      await context.github.issues.removeLabel(context.issue({ name: oldLabel }));
    }
    return true;
  }

  private async invokerIsAllowed(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
    oldIntegrationLabels: string[],
    integration?: string,
  ): Promise<boolean> {
    // Integration already set: only code owners of the current integration can change it
    if (oldIntegrationLabels.length > 0) {
      return !!invokerIsCodeOwner(command);
    }

    // No integration set: the issue author or code owners of the target integration can set it
    if (command.invoker.toLowerCase() === context.payload.issue.user.login.toLowerCase()) {
      return true;
    }
    return (
      integration !== undefined &&
      !!invokerIsCodeOwner(command, await fetchIntegrationManifest(integration))
    );
  }
}
