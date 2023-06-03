import { Organization } from '../github-webhook.const';
import { GithubClient } from '../github-webhook.model';

const ORG_TEAM_SEP = '/';
const TEAM_PREFIX = `${Organization.HOME_ASSISTANT}${ORG_TEAM_SEP}`;

export const expandTeams = async (
  usersAndTeams: string[],
  github: GithubClient,
): Promise<string[]> => {
  // Remove the `@` and lowercase
  usersAndTeams = usersAndTeams.map((name) =>
    name.startsWith('@') ? name.substring(1).toLowerCase() : name.toLowerCase(),
  );
  // Initialize list with users from usersAndTeams
  const users = usersAndTeams.filter((name) => !name.startsWith(TEAM_PREFIX));
  // For each team in usersAndTeams, add the members of the team to the list
  for (const team in usersAndTeams
    .filter((name) => name.startsWith(TEAM_PREFIX))
    .map((name) => name.split(ORG_TEAM_SEP)[1])) {
    users.push(
      ...(
        await github.teams.listMembersInOrg({
          org: Organization.HOME_ASSISTANT,
          team_slug: team,
        })
      ).data.map((member) => member.login.toLowerCase()),
    );
  }
  return users;
};
