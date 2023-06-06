import { WebhookContext } from '../github-webhook.model';

const ORG_TEAM_SEP = '/';

export const expandOrganizationTeams = async (
  context: WebhookContext<any>,
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
  for (const name in usersAndTeams.filter((name) => !users.includes(name))) {
    users.push(
      ...(
        await context.github.teams.listMembersInOrg({
          org: context.organization,
          team_slug: name.split(ORG_TEAM_SEP)[1],
        })
      ).data.map((member) => member.login.toLowerCase()),
    );
  }
  return users;
};
