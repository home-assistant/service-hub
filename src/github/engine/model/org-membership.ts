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
 * Per-dispatch dedupe: in-flight team fetches and membership checks. Unlike
 * team rosters, membership is deliberately not cached across dispatches — each
 * delivery re-checks it, so a member who leaves stops counting immediately.
 */
export interface OrgReads {
  teams: Map<string, Promise<string[]>>;
  members: Map<string, Promise<boolean>>;
}

export function createOrgReads(): OrgReads {
  return { teams: new Map(), members: new Map() };
}

/** Whether the login is an organization member; false on any failure. */
export function isOrgMember(
  github: Octokit,
  org: string,
  login: string,
  reads: OrgReads,
): Promise<boolean> {
  const key = login.toLowerCase();
  let inflight = reads.members.get(key);
  if (!inflight) {
    inflight = github.orgs
      .checkMembershipForUser({ org, username: login })
      .then(() => true)
      .catch((err: { status?: number }) => {
        // 404: not a member; 302: the requester may not ask about this org.
        if (err.status !== 404 && err.status !== 302) {
          log.warn("isOrgMember: fetch failed", { org, login, error: String(err) });
          reads.members.delete(key);
        }
        return false;
      });
    reads.members.set(key, inflight);
  }
  return inflight;
}

/** Lowercased member logins of a team; empty on fetch failure. */
export function readTeamMembers(
  github: Octokit,
  org: string,
  teamSlug: string,
  reads: OrgReads,
): Promise<string[]> {
  let shared = teamsByClient.get(github);
  if (!shared) {
    shared = new Map();
    teamsByClient.set(github, shared);
  }
  const key = `${org}/${teamSlug}`;
  const cached = shared.get(key);
  if (cached && Date.now() - cached.fetchedAt < TEAM_TTL_MS) {
    return Promise.resolve(cached.members);
  }

  let inflight = reads.teams.get(teamSlug);
  if (!inflight) {
    inflight = github
      .paginate(github.teams.listMembersInOrg, { org, team_slug: teamSlug, per_page: 100 })
      .then((data) => {
        const members = data.map((m) => m.login.toLowerCase());
        shared.set(key, { members, fetchedAt: Date.now() });
        return members;
      })
      .catch((err) => {
        log.warn("readTeamMembers: fetch failed", { org, team: teamSlug, error: String(err) });
        reads.teams.delete(teamSlug);
        return [];
      });
    reads.teams.set(teamSlug, inflight);
  }
  return inflight;
}

/**
 * Expand a CODEOWNERS-style owner list (users and `@org/team` refs) into
 * lowercased user logins. Non-team entries pass through unchanged.
 */
export async function expandTeamRefs(
  github: Octokit,
  org: string,
  usersAndTeams: string[],
  reads: OrgReads,
): Promise<string[]> {
  const normalized = usersAndTeams.map((name) =>
    name.startsWith("@") ? name.substring(1).toLowerCase() : name.toLowerCase(),
  );

  const teamPrefix = `${org}/`;
  const expanded: string[] = [];
  for (const name of normalized) {
    if (name.startsWith(teamPrefix)) {
      expanded.push(...(await readTeamMembers(github, org, name.slice(teamPrefix.length), reads)));
    } else {
      expanded.push(name);
    }
  }
  return expanded;
}
