import type { Octokit } from "@octokit/rest";
import type { GetIssueResponse } from "../../github/types.js";
import type { IssueComments } from "./pull-request.js";

export interface IssueRef {
  owner: string;
  repo: string;
  number: number;
}

/** Core fields a webhook payload MAY provide; undefined → hydrate. */
export interface IssueSeed {
  labels?: string[];
  body?: string | null;
  authorLogin?: string;
  assigneeLogins?: string[];
  state?: "open" | "closed";
}

/**
 * Read-model of an issue. Same seeding/hydration pattern as PullRequest,
 * with issues.get as the core group.
 */
export class Issue {
  readonly kind = "issue" as const;
  readonly owner: string;
  readonly repo: string;
  readonly number: number;

  private readonly github: Octokit;
  private seed: IssueSeed;
  private caches: {
    core?: Promise<GetIssueResponse>;
    issueComments?: Promise<IssueComments>;
  } = {};

  constructor(github: Octokit, ref: IssueRef, seed: IssueSeed = {}) {
    this.github = github;
    this.owner = ref.owner;
    this.repo = ref.repo;
    this.number = ref.number;
    this.seed = seed;
  }

  /** Same issue and caches, label state overridden (label-loop simulation). */
  withLabels(labels: string[]): Issue {
    const derived = new Issue(this.github, this, { ...this.seed, labels });
    derived.caches = this.caches;
    return derived;
  }

  private hydrate(): Promise<GetIssueResponse> {
    if (!this.caches.core) {
      const inflight = this.github.issues
        .get({ owner: this.owner, repo: this.repo, issue_number: this.number })
        .then((r) => r.data);
      inflight.catch(() => {
        if (this.caches.core === inflight) this.caches.core = undefined;
      });
      this.caches.core = inflight;
    }
    return this.caches.core;
  }

  private async coreField<T>(
    seeded: T | undefined,
    pick: (issue: GetIssueResponse) => T,
  ): Promise<T> {
    if (seeded !== undefined) return seeded;
    return pick(await this.hydrate());
  }

  labels(): Promise<string[]> {
    return this.coreField(this.seed.labels, (issue) =>
      issue.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))),
    );
  }

  body(): Promise<string | null> {
    return this.coreField(this.seed.body, (issue) => issue.body ?? null);
  }

  authorLogin(): Promise<string> {
    return this.coreField(this.seed.authorLogin, (issue) => issue.user?.login ?? "");
  }

  assigneeLogins(): Promise<string[]> {
    return this.coreField(this.seed.assigneeLogins, (issue) =>
      (issue.assignees ?? []).flatMap((a) => (a?.login ? [a.login] : [])),
    );
  }

  state(): Promise<"open" | "closed"> {
    return this.coreField(this.seed.state, (issue) => (issue.state === "open" ? "open" : "closed"));
  }

  issueComments(): Promise<IssueComments> {
    if (!this.caches.issueComments) {
      const inflight = this.github.paginate(this.github.issues.listComments, {
        owner: this.owner,
        repo: this.repo,
        issue_number: this.number,
        per_page: 100,
      });
      inflight.catch(() => {
        if (this.caches.issueComments === inflight) this.caches.issueComments = undefined;
      });
      this.caches.issueComments = inflight;
    }
    return this.caches.issueComments;
  }
}
