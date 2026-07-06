import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import { ParsedPath } from "../../../util/parse-path.js";

export type GetPullRequestParams = RestEndpointMethodTypes["pulls"]["get"]["parameters"];
export type GetPullRequestResponse = RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];
export type ListPullRequestFiles =
  RestEndpointMethodTypes["pulls"]["listFiles"]["response"]["data"];
export type PullRequestReviews =
  RestEndpointMethodTypes["pulls"]["listReviews"]["response"]["data"];
export type PullRequestReviewComments =
  RestEndpointMethodTypes["pulls"]["listReviewComments"]["response"]["data"];
export type IssueComments = RestEndpointMethodTypes["issues"]["listComments"]["response"]["data"];

export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

/**
 * Core fields a webhook payload MAY provide. `undefined` means the source
 * didn't carry the field and reading it hydrates via one cached pulls.get.
 * `mergeable_state` is deliberately absent: webhook payloads don't carry a
 * settled value, so it always comes from hydration.
 */
export interface PullRequestSeed {
  labels?: string[];
  body?: string | null;
  authorLogin?: string;
  authorAssociation?: string;
  assigneeLogins?: string[];
  draft?: boolean;
  headSha?: string;
  baseRef?: string;
  merged?: boolean;
  mergedAt?: string | null;
  state?: "open" | "closed";
  nodeId?: string;
}

/**
 * Read-model of a pull request. Seeded with whatever the triggering payload
 * provided; every accessor falls back to a lazily-fetched, per-endpoint cache
 * group (core = pulls.get, files, reviews, review comments, issue comments).
 * Each group costs exactly one request per dispatch no matter how many fields
 * or rules read it. Mutations stay Effects — this class never writes.
 */
export class PullRequest {
  readonly kind = "pull_request" as const;
  readonly owner: string;
  readonly repo: string;
  readonly number: number;

  private readonly github: Octokit;
  private seed: PullRequestSeed;
  // Slots hold the in-flight promise (concurrent readers dedupe to one
  // request) and are shared by reference with withLabels() derivatives.
  private caches: {
    core?: Promise<GetPullRequestResponse>;
    files?: Promise<ListPullRequestFiles>;
    integrationDomains?: Promise<string[]>;
    reviews?: Promise<PullRequestReviews>;
    reviewComments?: Promise<PullRequestReviewComments>;
    issueComments?: Promise<IssueComments>;
  } = {};

  constructor(github: Octokit, ref: PullRequestRef, seed: PullRequestSeed = {}) {
    this.github = github;
    this.owner = ref.owner;
    this.repo = ref.repo;
    this.number = ref.number;
    this.seed = seed;
  }

  /** Same PR and caches, label state overridden (label-loop simulation). */
  withLabels(labels: string[]): PullRequest {
    const derived = new PullRequest(this.github, this, { ...this.seed, labels });
    derived.caches = this.caches;
    return derived;
  }

  private params<T extends Record<string, unknown>>(data?: T) {
    return { owner: this.owner, repo: this.repo, pull_number: this.number, ...data };
  }

  /** One cached pulls.get backfills every core field the seed lacks. */
  private hydrate(): Promise<GetPullRequestResponse> {
    if (!this.caches.core) {
      const inflight = this.github.pulls.get(this.params()).then((r) => r.data);
      inflight.catch(() => {
        if (this.caches.core === inflight) this.caches.core = undefined;
      });
      this.caches.core = inflight;
    }
    return this.caches.core;
  }

  private async coreField<T>(
    seeded: T | undefined,
    pick: (pr: GetPullRequestResponse) => T,
  ): Promise<T> {
    if (seeded !== undefined) return seeded;
    return pick(await this.hydrate());
  }

  labels(): Promise<string[]> {
    return this.coreField(this.seed.labels, (pr) => pr.labels.map((l) => l.name));
  }

  body(): Promise<string | null> {
    return this.coreField(this.seed.body, (pr) => pr.body);
  }

  authorLogin(): Promise<string> {
    return this.coreField(this.seed.authorLogin, (pr) => pr.user?.login ?? "");
  }

  authorAssociation(): Promise<string> {
    return this.coreField(this.seed.authorAssociation, (pr) => pr.author_association);
  }

  /**
   * Whether the author is affiliated with the repo (owner, org member, or
   * collaborator). `author_association` is computed server-side.
   */
  async authorIsMember(): Promise<boolean> {
    const assoc = await this.authorAssociation();
    return assoc === "OWNER" || assoc === "MEMBER" || assoc === "COLLABORATOR";
  }

  assigneeLogins(): Promise<string[]> {
    return this.coreField(this.seed.assigneeLogins, (pr) =>
      (pr.assignees ?? []).flatMap((a) => (a?.login ? [a.login] : [])),
    );
  }

  isDraft(): Promise<boolean> {
    return this.coreField(this.seed.draft, (pr) => pr.draft ?? false);
  }

  headSha(): Promise<string> {
    return this.coreField(this.seed.headSha, (pr) => pr.head.sha);
  }

  baseRef(): Promise<string> {
    return this.coreField(this.seed.baseRef, (pr) => pr.base.ref);
  }

  merged(): Promise<boolean> {
    return this.coreField(this.seed.merged, (pr) => pr.merged);
  }

  mergedAt(): Promise<string | null> {
    return this.coreField(this.seed.mergedAt, (pr) => pr.merged_at);
  }

  state(): Promise<"open" | "closed"> {
    return this.coreField(this.seed.state, (pr) => (pr.state === "open" ? "open" : "closed"));
  }

  nodeId(): Promise<string> {
    return this.coreField(this.seed.nodeId, (pr) => pr.node_id);
  }

  /**
   * Never seeded: webhook payloads carry no settled value ("unknown"/null
   * means GitHub is still computing). Served from the dispatch's core
   * hydration — pinned for the dispatch; a later webhook re-evaluates.
   */
  mergeableState(): Promise<string> {
    return this.hydrate().then((pr) => pr.mergeable_state);
  }

  files(): Promise<ListPullRequestFiles> {
    if (!this.caches.files) {
      const inflight = this.github.paginate(
        this.github.pulls.listFiles,
        this.params({ per_page: 100 }),
      );
      inflight.catch(() => {
        if (this.caches.files === inflight) this.caches.files = undefined;
      });
      this.caches.files = inflight;
    }
    return this.caches.files;
  }

  /** Unique integration domains derived from the changed file paths. */
  integrationDomains(): Promise<string[]> {
    if (!this.caches.integrationDomains) {
      const inflight = this.files().then((files) => {
        const domains = new Set<string>();
        for (const file of files) {
          const parsed = new ParsedPath(file);
          if (parsed.component) domains.add(parsed.component);
        }
        return [...domains];
      });
      inflight.catch(() => {
        if (this.caches.integrationDomains === inflight) {
          this.caches.integrationDomains = undefined;
        }
      });
      this.caches.integrationDomains = inflight;
    }
    return this.caches.integrationDomains;
  }

  reviews(): Promise<PullRequestReviews> {
    if (!this.caches.reviews) {
      const inflight = this.github.paginate(
        this.github.pulls.listReviews,
        this.params({ per_page: 100 }),
      );
      inflight.catch(() => {
        if (this.caches.reviews === inflight) this.caches.reviews = undefined;
      });
      this.caches.reviews = inflight;
    }
    return this.caches.reviews;
  }

  /** Inline review comments; each carries a `reactions` rollup for free. */
  reviewComments(): Promise<PullRequestReviewComments> {
    if (!this.caches.reviewComments) {
      const inflight = this.github.paginate(
        this.github.pulls.listReviewComments,
        this.params({ per_page: 100 }),
      );
      inflight.catch(() => {
        if (this.caches.reviewComments === inflight) this.caches.reviewComments = undefined;
      });
      this.caches.reviewComments = inflight;
    }
    return this.caches.reviewComments;
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
