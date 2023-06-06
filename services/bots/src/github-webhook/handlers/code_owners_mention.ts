import { IssuesLabeledEvent, PullRequestLabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { issueFromPayload } from '../utils/issue';
import { expandOrganizationTeams } from '../utils/organization_teams';
import { BaseWebhookHandler } from './base';

import { CodeOwnersEntry, matchFile } from 'codeowners-utils';
import { ISSUE_COMMENT_COMMANDS } from './issue_comment_commands/handler';

const generateCodeOwnersMentionComment = (
  integration: string,
  codeOwners: string[],
  triggerLabel: string,
  codeownersLine: string,
) => `
Hey there ${codeOwners.join(
  ', ',
)}, mind taking a look at this ${triggerLabel} as it has been labeled with an integration (\`${integration}\`) you are listed as a [code owner](${codeownersLine}) for? Thanks!

<details>
<summary>Code owner commands</summary>


Code owners of \`${integration}\` can trigger bot actions by commenting:

${ISSUE_COMMENT_COMMANDS.filter((command) => command.invokerType === 'code_owner')
  .map(
    (command) =>
      `- \`${[
        '@home-assistant',
        command.command,
        command.exampleAdditional?.replace('<domain>', integration),
      ]
        .filter((item) => item !== undefined)
        .join(' ')
        .trim()}\` ${command.description?.replace('<type>', triggerLabel)}`,
  )
  .join('\n')}

</details>

`;

export class CodeOwnersMention extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.ISSUES_LABELED, EventType.PULL_REQUEST_LABELED];
  public allowedRepositories = [
    HomeAssistantRepository.CORE,
    HomeAssistantRepository.HOME_ASSISTANT_IO,
  ];

  async handle(context: WebhookContext<IssuesLabeledEvent | PullRequestLabeledEvent>) {
    if (!context.payload.label || !context.payload.label.name.startsWith('integration: ')) {
      return;
    }

    const triggerIssue = issueFromPayload(context.payload);
    const integrationName = context.payload.label.name.split('integration: ')[1];
    const path =
      context.repository === HomeAssistantRepository.CORE
        ? `homeassistant/components/${integrationName}/*`
        : `source/_integrations/${integrationName}.markdown`;

    const codeownersData = await context.github.repos.getContent(
      context.repo({ path: 'CODEOWNERS' }),
    );

    const codeownersContent = Buffer.from(
      // @ts-ignore
      codeownersData.data.content,
      'base64',
    ).toString();

    if (!codeownersContent.includes(integrationName)) {
      return;
    }

    const match = matchFile(path, parse(codeownersContent)) as CodeOwnerEntry;
    if (!match) {
      return;
    }

    // Remove the `@` and lowercase
    const owners = match.owners.map((owner) => owner.substring(1).toLowerCase());
    const codeownersLine = `${
      // @ts-ignore
      codeownersData.data.html_url
    }#L${match.line}`;

    const assignees = triggerIssue.assignees.map((assignee) => assignee.login.toLowerCase());
    const commentersData = await context.github.issues.listComments(
      context.issue({ per_page: 100 }),
    );
    const commenters = commentersData.data.map((commenter) => commenter.user.login.toLowerCase());
    const payloadUsername = triggerIssue.user.login.toLowerCase();
    const ownersMinusAuthor = owners.filter((usr) => usr !== payloadUsername);

    for (const owner of ownersMinusAuthor) {
      try {
        await context.github.issues.addAssignees(context.issue({ assignees: [owner] }));
      } catch (_) {
        // Ignore assignment issues
      }
    }

    const mentions = ownersMinusAuthor
      .filter((usr) => !assignees.includes(usr) && !commenters.includes(usr))
      // Add `@` because used in a comment.
      .map((usr) => `@${usr}`);

    if (mentions.length > 0) {
      const triggerLabel =
        context.repository === HomeAssistantRepository.CORE
          ? context.eventType.startsWith('issues')
            ? 'issue'
            : 'pull request'
          : 'feedback';

      context.scheduleIssueComment({
        handler: 'CodeOwnersMention',
        comment: generateCodeOwnersMentionComment(
          integrationName,
          mentions,
          triggerLabel,
          codeownersLine,
        ),
        priority: 1,
      });
    }

    const expandedOwners = await expandOrganizationTeams(context, owners, context.github);
    // Add a label if author of issue/PR is a code owner
    if (expandedOwners.includes(payloadUsername)) {
      context.scheduleIssueLabel('by-code-owner');
    }
  }
}

// Temporary local patched version of what's in codeowners-utils
// until https://github.com/jamiebuilds/codeowners-utils/pull/1 is merged

interface CodeOwnerEntry extends CodeOwnersEntry {
  line: number;
}

function parse(str: string) {
  const entries: Array<CodeOwnerEntry> = [];

  str.split('\n').forEach((entry, idx) => {
    let [content, _] = entry.split('#');
    let trimmed = content.trim();
    if (trimmed === '') return;
    let [pattern, ...owners] = trimmed.split(/\s+/);
    let line = idx + 1;
    entries.push({ pattern, owners, line });
  });

  return entries.reverse();
}
