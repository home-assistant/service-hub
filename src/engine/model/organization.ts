import type { Octokit } from "@octokit/rest";

/**
 * Read-model of the organization an event happened in. Team membership is
 * cached per team slug for the dispatch.
 */
export class Org {
  readonly name: string;

  private readonly github: Octokit;
  private teamCache = new Map<string, Promise<string[]>>();

  constructor(github: Octokit, name: string) {
    this.github = github;
    this.name = name;
  }

  /** Lowercased member logins of a team; empty on fetch failure. */
  teamMembers(teamSlug: string): Promise<string[]> {
    let inflight = this.teamCache.get(teamSlug);
    if (!inflight) {
      inflight = this.github.teams
        .listMembersInOrg({ org: this.name, team_slug: teamSlug })
        .then((r) => r.data.map((m) => m.login.toLowerCase()))
        .catch((err) => {
          console.warn(`Org.teamMembers: ${this.name}/${teamSlug} failed:`, err);
          this.teamCache.delete(teamSlug);
          return [];
        });
      this.teamCache.set(teamSlug, inflight);
    }
    return inflight;
  }

  /**
   * Expand a CODEOWNERS-style owner list (users and `@org/team` refs) into
   * lowercased user logins. Non-team entries pass through unchanged.
   */
  async expandTeams(usersAndTeams: string[]): Promise<string[]> {
    const normalized = usersAndTeams.map((name) =>
      name.startsWith("@") ? name.substring(1).toLowerCase() : name.toLowerCase(),
    );

    const teamPrefix = `${this.name}/`;
    const expanded: string[] = [];
    for (const name of normalized) {
      if (name.startsWith(teamPrefix)) {
        expanded.push(...(await this.teamMembers(name.slice(teamPrefix.length))));
      } else {
        expanded.push(name);
      }
    }
    return expanded;
  }
}
