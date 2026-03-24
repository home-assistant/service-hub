import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';
import { entityComponents } from '../../../github-webhook.const';
import { WebhookContext } from '../../../github-webhook.model';
import { fetchIntegrationManifest } from '../../../utils/integration';
import { extractIntegrationDocumentationLinks } from '../../../utils/text_parser';
import { invokerIsCodeOwner, IssueCommentCommandContext } from '../const';
import { IssueCommentCommandBase } from './base';

const USAGE_HINT = [
  'Use the integration domain name or a documentation link.',
  'Example: `@home-assistant set-integration zha`',
  'or: `@home-assistant set-integration https://www.home-assistant.io/integrations/zha`',
  '',
  'You can find the domain name in the URL of the integration page on the ' +
    'Home Assistant website (e.g. `https://www.home-assistant.io/integrations/<domain>`) ' +
    'or in your local Home Assistant instance under ' +
    '**Settings → Devices & Services** (e.g. `http://<ip>:8123/config/integrations/integration/<domain>`).',
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

export class SetIntegrationCommentCommand implements IssueCommentCommandBase {
  command = 'set-integration';
  exampleAdditional = 'zha';
  requireAdditional = false;

  description(_context: WebhookContext<any>) {
    return 'Set the integration label on an issue.';
  }

  async handle(
    context: WebhookContext<IssueCommentCreatedEvent>,
    command: IssueCommentCommandContext,
  ) {
    // Only allow on issues, not on pull requests
    if (context.payload.issue.pull_request) {
      await context.github.issues.createComment(
        context.issue({ body: 'This command can only be used on issues, not on pull requests.' }),
      );
      throw new Error('Not an issue.');
    }

    if (!command.additional) {
      await context.github.issues.createComment(
        context.issue({
          body: `Please provide an integration domain or documentation link.\n${USAGE_HINT}`,
        }),
      );
      throw new Error('No integration provided.');
    }

    const integration = parseIntegrationFromInput(command.additional)?.toLowerCase();
    if (!integration) {
      await context.github.issues.createComment(
        context.issue({
          body: `Could not determine the integration from the provided input.\n${USAGE_HINT}`,
        }),
      );
      throw new Error('Could not parse integration.');
    }

    // Check if the integration label exists
    const label = `integration: ${integration}`;

    // Check if the label is already set
    if (command.currentLabels.includes(label)) {
      await context.github.issues.createComment(
        context.issue({ body: `The integration \`${integration}\` is already set on this issue.` }),
      );
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

    // Check permissions
    const hasIntegrationLabel = command.currentLabels.some((l) => l.startsWith('integration: '));

    if (hasIntegrationLabel) {
      // Integration already set: only code owner of the EXISTING integration can change it
      if (!invokerIsCodeOwner(command)) {
        await context.github.issues.createComment(
          context.issue({
            body: 'An integration is already set on this issue. Only code owners of the currently set integration can change it.',
          }),
        );
        throw new Error('Not authorized to change integration.');
      }
    } else {
      // No integration set: issue author or code owner of the TARGET integration can set it
      const isIssueAuthor =
        command.invoker.toLowerCase() === context.payload.issue.user.login.toLowerCase();

      let isTargetCodeOwner = false;
      if (!isIssueAuthor) {
        try {
          const manifest = await fetchIntegrationManifest(integration);
          isTargetCodeOwner =
            manifest?.codeowners
              ?.map((co) => co.substring(1).toLowerCase())
              ?.includes(command.invoker.toLowerCase()) ?? false;
        } catch (_) {
          // If we can't fetch the manifest, we can't verify code ownership
        }
      }

      if (!isIssueAuthor && !isTargetCodeOwner) {
        await context.github.issues.createComment(
          context.issue({
            body: 'Only the issue author and code owners can use this command.',
          }),
        );
        throw new Error('Not authorized.');
      }
    }

    // Remove old integration labels before adding the new one
    const oldIntegrationLabels = command.currentLabels.filter((l) => l.startsWith('integration: '));
    for (const oldLabel of oldIntegrationLabels) {
      await context.github.issues.removeLabel(context.issue({ name: oldLabel }));
    }

    await context.github.issues.addLabels(context.issue({ labels: [label] }));
  }
}
