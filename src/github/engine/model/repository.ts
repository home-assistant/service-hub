import type { Octokit } from "@octokit/rest";

const CODEOWNERS_TTL_MS = 5 * 60 * 1000;

/**
 * Process-wide CODEOWNERS cache (the file is ~100 KB and rarely changes).
 * Within the TTL the cached copy is served without any request; after it, an
 * If-None-Match revalidation lets GitHub answer 304 — no body, and 304s don't
 * count against the rate limit — unless the file actually changed.
 */
const codeownersByRepo = new Map<
  string,
  { etag: string; content: string | null; fetchedAt: number }
>();

/**
 * Read-model of the repository an event happened in. Everything sync here is
 * present in every webhook payload's `repository` object.
 */
export class Repo {
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
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
    this.fullName = info.fullName;
    this.topics = info.topics ?? [];
  }

  get organization(): string {
    return this.owner;
  }

  /**
   * Raw CODEOWNERS file content at HEAD, or null if the repo has none.
   * Fetch failures (auth, rate limit, network) propagate to the caller.
   */
  codeownersContent(): Promise<string | null> {
    if (!this.codeownersCache) {
      this.codeownersCache = this.fetchCodeowners().catch((err) => {
        this.codeownersCache = undefined;
        if ((err as { status?: number }).status === 404) return null;
        throw err;
      });
    }
    return this.codeownersCache;
  }

  private async fetchCodeowners(): Promise<string | null> {
    const cached = codeownersByRepo.get(this.fullName);
    if (cached && Date.now() - cached.fetchedAt < CODEOWNERS_TTL_MS) return cached.content;

    try {
      const res = await this.github.repos.getContent({
        owner: this.owner,
        repo: this.name,
        path: "CODEOWNERS",
        ...(cached ? { headers: { "if-none-match": cached.etag } } : {}),
      });
      const content =
        "content" in res.data
          ? new TextDecoder().decode(
              Uint8Array.from(atob(res.data.content), (c) => c.charCodeAt(0)),
            )
          : null;
      const etag = (res.headers as { etag?: string } | undefined)?.etag;
      if (etag) {
        codeownersByRepo.set(this.fullName, { etag, content, fetchedAt: Date.now() });
      }
      return content;
    } catch (err) {
      if ((err as { status?: number }).status === 304 && cached) {
        cached.fetchedAt = Date.now();
        return cached.content;
      }
      throw err;
    }
  }
}
