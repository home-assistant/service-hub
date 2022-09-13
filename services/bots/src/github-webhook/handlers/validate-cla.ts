import { ConfigService } from '@nestjs/config';
import { BaseWebhookHandler } from './base';

import { DynamoDB } from 'aws-sdk';
import { ClaIssueLabel } from '@lib/common/github';
import {
  WebhookHandlerParams,
  ListCommitResponse,
  PullRequestEventData,
  scheduleIssueComment,
  scheduleIssueLabel,
} from '../github-webhook.const';

const ignoredAuthors: Set<string> = new Set([
  // Ignore bot accounts that are not masked as bots
  'travis@travis-ci.org',
  'ImgBotHelp@gmail.com',
  'support@lokalise.com',
]);

const ignoredRepositories: Set<string> = new Set([
  // Ignore repositories that do not contain code
  'home-assistant/.github',
  'home-assistant/1password-teams-open-source',
  'home-assistant/architecture',
  'home-assistant/assets',
  'home-assistant/brands',
  'home-assistant/bthome.io',
  'home-assistant/companion.home-assistant',
  'home-assistant/data.home-assistant',
  'home-assistant/developers.home-assistant',
  'home-assistant/home-assistant.io',
  'home-assistant/organization',
  'home-assistant/partner.home-assistant',
  'home-assistant/people',
  'home-assistant/version',
]);

const botContextName = 'cla-bot';

export class ValidateCla extends BaseWebhookHandler {
  private ddbClient: DynamoDB;
  private signersTableName: string;
  private pendingSignersTableName: string;

  constructor(configService: ConfigService) {
    super(configService);
    this.ddbClient = new DynamoDB({ region: configService.get('dynamodb.cla.region') });
    this.signersTableName = configService.get('dynamodb.cla.signersTable');
    this.pendingSignersTableName = configService.get('dynamodb.cla.pendingSignersTable');
  }

  async handle(params: WebhookHandlerParams) {
    if (
      ![
        'pull_request.labeled',
        'pull_request.opened',
        'pull_request.reopened',
        'pull_request.synchronize',
      ].includes(params.eventType)
    ) {
      return;
    }

    const eventData = params.payload as PullRequestEventData;

    if (ignoredRepositories.has(eventData.repository.full_name)) {
      return;
    }

    if (eventData.action === 'labeled') {
      if (eventData.label.name !== ClaIssueLabel.CLA_RECHECK) {
        return;
      }
      await this.githubApiClient.issues.removeLabel({
        owner: eventData.repository.owner.login,
        repo: eventData.repository.name,
        issue_number: eventData.number,
        name: ClaIssueLabel.CLA_RECHECK,
      });
    }

    const commits = await this.getCommits(eventData);
    await this.checkAuthors(params, eventData, commits.data);
  }

  getCommits(eventData: PullRequestEventData): Promise<ListCommitResponse> {
    return this.githubApiClient.pulls.listCommits({
      owner: eventData.repository.owner.login,
      repo: eventData.repository.name,
      pull_number: eventData.number,
      per_page: 100,
    });
  }

  async checkAuthors(
    params: WebhookHandlerParams,
    eventData: PullRequestEventData,
    commits: ListCommitResponse['data'],
  ) {
    const authorsWithSignedCLA: Set<string> = new Set();
    const authorsNeedingCLA: { sha: string; login: string }[] = [];
    const commitsWithoutLogins: { sha: string; maybeText: string }[] = [];

    for await (const commit of commits) {
      if (commit.author?.type === 'Bot' || ignoredAuthors.has(commit.commit?.author?.email)) {
        continue;
      }

      if (!commit.author && commit.commit?.author?.email) {
        commitsWithoutLogins.push({
          sha: commit.sha,
          maybeText: commit.commit.author.email.includes('@')
            ? `This commit has something that looks like an email address (${commit.commit.author.email}). Maybe try linking that to GitHub?.`
            : 'No email found attached to the commit.',
        });
      }

      if (!authorsWithSignedCLA.has(commit.author?.login)) {
        const ddbEntry = await this.ddbClient
          .getItem({
            TableName: this.signersTableName,
            Key: { github_username: { S: commit.author.login } },
          })
          .promise();

        if (!ddbEntry.Item || ddbEntry.$response.error) {
          authorsNeedingCLA.push({ login: commit.author.login, sha: commit.sha });
        } else {
          authorsWithSignedCLA.add(commit.author.login);
        }
      }
    }

    if (commitsWithoutLogins.length) {
      scheduleIssueComment(
        params.deliveryId,
        botContextName,
        noLoginOnShaComment(
          commitsWithoutLogins,
          eventData.pull_request.user.login,
          `https://github.com/${eventData.repository.full_name}/pull/${eventData.number}/commits/`,
        ),
      );

      scheduleIssueLabel(params.deliveryId, ClaIssueLabel.CLA_ERROR);

      commitsWithoutLogins.forEach((commit) => {
        this.githubApiClient.repos.createCommitStatus({
          owner: eventData.repository.owner.login,
          repo: eventData.repository.name,
          sha: commit.sha,
          state: 'failure',
          description: 'Commit(s) are missing a linked GitHub user.',
          context: botContextName,
        });
      });
      return;
    }

    if (authorsNeedingCLA.length) {
      await this.githubApiClient.issues.createComment({
        owner: eventData.repository.owner.login,
        repo: eventData.repository.name,
        issue_number: eventData.number,
        body: pullRequestComment(authorsNeedingCLA, eventData.number),
      });
      scheduleIssueLabel(params.deliveryId, ClaIssueLabel.CLA_NEEDED);

      authorsNeedingCLA.forEach((entry) =>
        this.githubApiClient.repos.createCommitStatus({
          owner: eventData.repository.owner.login,
          repo: eventData.repository.name,
          sha: entry.sha,
          state: 'failure',
          description: 'At least one contributor needs to sign the CLA',
          context: botContextName,
        }),
      );

      const missingSign: { [key: string]: string[] } = {};

      authorsNeedingCLA.forEach((entry) => {
        if (!missingSign[entry.login]) {
          missingSign[entry.login] = [];
        }
        missingSign[entry.login].push(entry.sha);
      });

      await Promise.all(
        Object.keys(missingSign).map((author) =>
          this.ddbClient
            .putItem({
              TableName: this.pendingSignersTableName,
              Item: {
                github_username: { S: author },
                commits: { L: missingSign[author].map((entry) => ({ S: entry })) },
                pr: { S: `${eventData.repository.full_name}#${eventData.number}` },
                repository_owner: { S: eventData.repository.owner.login },
                repository: { S: eventData.repository.name },
                pr_number: { S: String(eventData.number) },
                signatureRequestedAt: { S: new Date().toISOString() },
              },
            })
            .promise(),
        ),
      );

      return;
    }

    // If we get here, all is good :+1:
    scheduleIssueLabel(params.deliveryId, ClaIssueLabel.CLA_SIGNED);
    try {
      await this.githubApiClient.issues.removeLabel({
        owner: eventData.repository.owner.login,
        repo: eventData.repository.name,
        issue_number: eventData.number,
        name: ClaIssueLabel.CLA_NEEDED,
      });
    } catch {
      // ignroe missing label
    }

    commits.forEach((commit) => {
      this.githubApiClient.repos.createCommitStatus({
        owner: eventData.repository.owner.login,
        repo: eventData.repository.name,
        sha: commit.sha,
        state: 'success',
        description: 'Everyone involved has signed the CLA',
        context: botContextName,
      });
    });
  }
}

const noLoginOnShaComment = (
  commits: { sha: string; maybeText: string }[],
  prAuthor: string,
  url_prefix: string,
) => `
Hello @${prAuthor},

When attempting to inspect the commits of your pull request for CLA signature status among all authors we encountered commit(s) which were not linked to a GitHub account, thus not allowing us to determine their status(es).

The commits that are missing a linked GitHub account are the following:

${commits
  .map(
    (commit) => `
- [\`${commit.sha}\`](${url_prefix}${commit.sha}) - ${commit.maybeText}
`,
  )
  .join('\n')}

Unfortunately, **we are unable to accept this pull request until this situation is corrected.**

Here are your options:

1. If you had an email address set for the commit that simply wasn't linked to your GitHub account you can link that email now and it will retroactively apply to your commits. The simplest way to do this is to click the link to one of the above commits and look for a blue question mark in a blue circle in the top left. Hovering over that bubble will show you what email address you used. Clicking on that button will take you to your email address settings on GitHub. Just add the email address on that page and you're all set. GitHub has more information about this option [in their help center](https://help.github.com/articles/setting-your-email-in-git/#commits-on-github-arent-linking-to-my-account).

2. If you didn't use an email address at all, it was an invalid email, or it's one you can't link to your GitHub, you will need to change the authorship information of the commit and your global Git settings so this doesn't happen again going forward. GitHub provides some great instructions on how to change your authorship information [in their help center](https://help.github.com/articles/setting-your-email-in-git/).
   * If you only made a single commit you should be able to run
      \`\`\`
      git commit --amend --author="Author Name <email@address.com>"
      \`\`\`
      (substituting "Author Name" and "\`email@address.com\`" for your actual information) to set the authorship information.
   * If you made more than one commit and the commit with the missing authorship information is not the most recent one you have two options:
       1. You can re-create all commits missing authorship information. This is going to be the easiest solution for developers that aren't extremely confident in their Git and command line skills.
       2. You can use [this script](https://help.github.com/articles/changing-author-info/) that GitHub provides to rewrite history. **Please note:** this should be used only if you are very confident in your abilities and understand its impacts.
   * Whichever method you choose, I will come by to re-check the pull request once you push the fixes to this branch.

We apologize for this inconvenience, especially since it usually bites new contributors to Home Assistant. We hope you understand the need for us to protect ourselves and the great community we all have built legally. The best thing to come out of this is that you only need to fix this once and it benefits the entire Home Assistant and GitHub community.

Thanks, I look forward to checking this PR again soon! :heart:
`;

const pullRequestComment = (users: { sha: string; login: string }[], prNumber: string | number) => `
Hi ${users.map((user) => `@${user.login}`).join(',')}

It seems you haven't yet signed a CLA. Please do so [here](https://home-assistant.io/developers/cla_sign_start/?pr=${prNumber}).

Once you do that we will be able to review and accept this pull request.

Thanks!
`;
