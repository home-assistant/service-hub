import type { Octokit } from "@octokit/rest";
import type { Organization, Repository } from "../../util/repositories.js";

/**
 * Read-model of the repository an event happened in. Everything sync here is
 * present in every webhook payload's `repository` object.
 */
export class Repo {
  readonly owner: string;
  readonly name: string;
  readonly fullName: Repository;
  readonly topics: string[];

  private readonly github: Octokit;
  private codeownersCache?: Promise<string | null>;

  constructor(
    github: Octokit,
    info: { owner: string; name: string; fullName: string; topics?: string[] },
  ) {
    this.github = github;
    this.owner = info.owner;
    this.name = info.name;
    this.fullName = info.fullName as Repository;
    this.topics = info.topics ?? [];
  }

  get organization(): Organization {
    return this.owner as Organization;
  }

  /** Raw CODEOWNERS file content at HEAD, or null if absent/unreadable. */
  codeownersContent(): Promise<string | null> {
    if (!this.codeownersCache) {
      this.codeownersCache = this.github.repos
        .getContent({ owner: this.owner, repo: this.name, path: "CODEOWNERS" })
        .then(({ data }) => {
          if (!("content" in data)) return null;
          return new TextDecoder().decode(
            Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0)),
          );
        })
        .catch((err) => {
          console.warn(`Repo.codeownersContent: fetch for ${this.fullName} failed:`, err);
          this.codeownersCache = undefined;
          return null;
        });
    }
    return this.codeownersCache;
  }
}
