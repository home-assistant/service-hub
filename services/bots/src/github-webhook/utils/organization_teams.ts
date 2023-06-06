import {
  IssuesLabeledEvent,
  PullRequestLabeledEvent,
  PullRequestOpenedEvent,
  PullRequestReopenedEvent,
  PullRequestReviewSubmittedEvent,
  PullRequestSynchronizeEvent,
  PullRequestUnlabeledEvent,
} from '@octokit/webhooks-types';
import { GithubClient, WebhookContext } from '../github-webhook.model';

const ORG_TEAM_SEP = '/';

export const expandOrganizationTeams = async (
  context: WebhookContext<
    | IssuesLabeledEvent
    | PullRequestLabeledEvent
    | PullRequestOpenedEvent
    | PullRequestReopenedEvent
    | PullRequestReviewSubmittedEvent
    | PullRequestSynchronizeEvent
    | PullRequestUnlabeledEvent
  >,
  usersAndTeams: string[],
): Promise<string[]> => {
  // Remove the `@` and lowercase
  usersAndTeams = usersAndTeams.map((name) =>
    name.startsWith('@') ? name.substring(1).toLowerCase() : name.toLowerCase(),
  );
  // Initialize list with users from usersAndTeams
  const users = usersAndTeams.filter(
    (name) => !name.startsWith(`${context.organization}${ORG_TEAM_SEP}`),
  );
  // For each team in usersAndTeams, add the members of the team to the list
  for (const team in usersAndTeams
    .filter((name) => !users.includes(name))
    .map((name) => name.split(ORG_TEAM_SEP)[1])) {
    users.push(
      ...(
        await context.github.teams.listMembersInOrg({
          org: context.organization,
          team_slug: team,
        })
      ).data.map((member) => member.login.toLowerCase()),
    );
  }
  return users;
};
