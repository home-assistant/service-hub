import type { Octokit } from "@octokit/rest";
import { log } from "../../../log.js";

const TEAM_TTL_MS = 15 * 60 * 1000;

/**
 * Cross-event team-roster cache (org-internal teams like @home-assistant/core
 * change rarely). Keyed by client so each test's mock Octokit gets its own
 * cache; production uses one long-lived client, so entries span deliveries.
 */
const teamsByClient = new WeakMap<Octokit, Map<string, { members: string[]; fetchedAt: number }>>();

/**
 * Read-model of the organization an event happened in. Team membership is
 * cached per team slug for the dispatch.
 */
export class Org {
  readonly name: string;

  private readonly github: Octokit;
  private teamCache = new Map<string, Promise<string[]>>();
  private memberCache = new Map<string, Promise<boolean>>();

  constructor(github: Octokit, name: string) {
    this.github = github;
    this.name = name;
  }

  /** Whether the login is an organization member; false on any failure. */
  hasMember(login: string): Promise<boolean> {
    const key = login.toLowerCase();
    let inflight = this.memberCache.get(key);
    if (!inflight) {
      inflight = this.github.orgs
        .checkMembershipForUser({ org: this.name, username: login })
        .then(() => true)
        .catch((err: { status?: number }) => {
          // 404: not a member; 302: the requester may not ask about this org.
          if (err.status !== 404 && err.status !== 302) {
            log.warn("Org.hasMember: fetch failed", {
              org: this.name,
              login,
              error: String(err),
            });
            this.memberCache.delete(key);
          }
          return false;
        });
      this.memberCache.set(key, inflight);
    }
    return inflight;
  }

  /** Lowercased member logins of a team; empty on fetch failure. */
  teamMembers(teamSlug: string): Promise<string[]> {
    let shared = teamsByClient.get(this.github);
    if (!shared) {
      shared = new Map();
      teamsByClient.set(this.github, shared);
    }
    const key = `${this.name}/${teamSlug}`;
    const cached = shared.get(key);
    if (cached && Date.now() - cached.fetchedAt < TEAM_TTL_MS) {
      return Promise.resolve(cached.members);
    }

    let inflight = this.teamCache.get(teamSlug);
    if (!inflight) {
      inflight = this.github.teams
        .listMembersInOrg({ org: this.name, team_slug: teamSlug })
        .then((r) => {
          const members = r.data.map((m) => m.login.toLowerCase());
          shared.set(key, { members, fetchedAt: Date.now() });
          return members;
        })
        .catch((err) => {
          log.warn("Org.teamMembers: fetch failed", {
            org: this.name,
            team: teamSlug,
            error: String(err),
          });
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
