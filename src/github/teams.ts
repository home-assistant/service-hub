import type { Octokit } from "@octokit/rest";

export async function expandOrganizationTeams(
  github: Octokit,
  organization: string,
  usersAndTeams: string[],
): Promise<string[]> {
  const normalized = usersAndTeams.map((name) =>
    name.startsWith("@") ? name.substring(1).toLowerCase() : name.toLowerCase(),
  );

  const teamPrefix = `${organization}/`;
  const teamNames = normalized.filter((name) => name.startsWith(teamPrefix));
  const users = normalized.filter((name) => !name.startsWith(teamPrefix));

  const expanded = [...users];
  for (const teamName of teamNames) {
    try {
      const members = await github.teams.listMembersInOrg({
        org: organization,
        team_slug: teamName.split("/")[1],
      });
      expanded.push(...members.data.map((m) => m.login.toLowerCase()));
    } catch (err) {
      console.warn(
        `expandOrganizationTeams: listMembersInOrg ${organization}/${teamName} failed:`,
        err,
      );
    }
  }

  return expanded;
}
