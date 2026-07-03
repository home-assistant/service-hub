import type { Octokit } from "@octokit/rest";
import type {
  IssueCommentCreatedEvent,
  IssuesLabeledEvent,
  IssuesOpenedEvent,
  PullRequestClosedEvent,
  PullRequestEditedEvent,
  PullRequestLabeledEvent,
  PullRequestOpenedEvent,
  PullRequestReadyForReviewEvent,
  PullRequestReopenedEvent,
  PullRequestReviewSubmittedEvent,
  PullRequestSynchronizeEvent,
  PullRequestUnlabeledEvent,
} from "@octokit/webhooks-types";
import type {
  EventType,
  GetIssueParams,
  GetIssueResponse,
  GetPullRequestParams,
  GetPullRequestResponse,
  ListPullRequestFiles,
} from "../github/types.js";
import { ParsedPath } from "../util/parse-path.js";
import type { Organization, Repository } from "../util/repositories.js";

/**
 * Synthetic payload for `EventType.ON_DEMAND`. Built by the bot when the
 * cron sweep or the `/<slug> update` command re-evaluates a PR.
 */
export interface OnDemandEvent {
  action: "on_demand";
  pull_request: GetPullRequestResponse;
  repository: GetPullRequestResponse["base"]["repo"];
  sender: { login: string; type: "User" | "Bot" };
}

/**
 * Discriminates whether a webhook dispatch concerns an Issue or a PR.
 *
 * Some GitHub events (notably `issue_comment`) can fire for either, so
 * consumers that need to behave differently can branch on `context.type`
 * instead of sniffing payload shape.
 */
export enum WebhookContextType {
  ISSUE = "issue",
  PULL_REQUEST = "pull_request",
}

export type WebhookEventPayload =
  | IssueCommentCreatedEvent
  | IssuesLabeledEvent
  | IssuesOpenedEvent
  | PullRequestClosedEvent
  | PullRequestEditedEvent
  | PullRequestLabeledEvent
  | PullRequestOpenedEvent
  | PullRequestReadyForReviewEvent
  | PullRequestReopenedEvent
  | PullRequestReviewSubmittedEvent
  | PullRequestSynchronizeEvent
  | PullRequestUnlabeledEvent
  | OnDemandEvent;

interface WebhookContextParams<P extends WebhookEventPayload> {
  github: Octokit;
  payload: P;
  eventType: EventType;
  botSlug: string;
  dryRun?: boolean;
  /** Reports unexpected engine conditions (e.g. Sentry.captureException). */
  captureException?: (err: unknown) => void;
}

export class WebhookContext<P extends WebhookEventPayload = WebhookEventPayload> {
  readonly github: Octokit;
  readonly eventType: EventType;
  readonly type: WebhookContextType;
  readonly repository: Repository;
  readonly organization: Organization;
  readonly payload: P;
  readonly botSlug: string;
  readonly dryRun: boolean;
  readonly captureException?: (err: unknown) => void;

  // Caches store the in-flight *promise*, not the resolved value, so that rules
  // dispatched concurrently (see dispatch() / Promise.allSettled) dedupe to a
  // single underlying request. Caching the resolved value instead would leave a
  // check-then-act race across the `await`: a second caller arriving before the
  // first resolves would miss the cache and fire a duplicate request.
  //
  // One shared object so withSyntheticEvent() children and the parent context
  // see each other's fetches.
  private _caches = {
    prFiles: undefined as Promise<ListPullRequestFiles> | undefined,
    integrationDomains: undefined as Promise<string[]> | undefined,
    issue: new Map<string, Promise<GetIssueResponse>>(),
    pullRequest: new Map<string, Promise<GetPullRequestResponse>>(),
  };

  get prFilesCache(): Promise<ListPullRequestFiles> | undefined {
    return this._caches.prFiles;
  }

  set prFilesCache(value: Promise<ListPullRequestFiles> | undefined) {
    this._caches.prFiles = value;
  }

  constructor(params: WebhookContextParams<P>) {
    this.github = params.github;
    this.eventType = params.eventType;
    this.payload = params.payload;
    this.botSlug = params.botSlug;
    this.dryRun = params.dryRun ?? false;
    this.captureException = params.captureException;
    this.repository = params.payload.repository.full_name as Repository;
    this.organization = params.payload.repository.owner.login as Organization;
    this.type = deriveContextType(params.payload);
  }

  /**
   * Context for a synthetic event on the same issue/PR, sharing this
   * context's request caches. Used by the dispatcher's label loop.
   */
  withSyntheticEvent<Q extends WebhookEventPayload>(
    payload: Q,
    eventType: EventType,
  ): WebhookContext<Q> {
    const child = new WebhookContext<Q>({
      github: this.github,
      payload,
      eventType,
      botSlug: this.botSlug,
      dryRun: this.dryRun,
      captureException: this.captureException,
    });
    child._caches = this._caches;
    return child;
  }

  /** Bot's commit-status creator login, e.g. "ha-bot[bot]". */
  get botLogin(): string {
    return `${this.botSlug}[bot]`;
  }

  get senderIsBot(): boolean {
    return this.payload.sender.type === "Bot" || this.payload.sender.login === "homeassistant";
  }

  get headSha(): string {
    if ("pull_request" in this.payload && this.payload.pull_request) {
      return this.payload.pull_request.head.sha;
    }
    return "";
  }

  /**
   * The issue or pull-request number in scope for this event. PRs and
   * issues share a numbering space on GitHub (a PR is a kind of issue),
   * so `issue_number` and `pull_number` always refer to the same value.
   */
  get number(): number {
    if ("issue" in this.payload && this.payload.issue) return this.payload.issue.number;
    if ("pull_request" in this.payload && this.payload.pull_request) {
      return this.payload.pull_request.number;
    }
    throw new Error(`WebhookContext.number: event ${this.eventType} has no issue or PR number`);
  }

  repo<T extends Record<string, unknown> = Record<string, never>>(
    data?: T,
  ): { owner: string; repo: string } & T {
    return {
      owner: this.payload.repository.owner.login,
      repo: this.payload.repository.name,
      ...data,
    } as { owner: string; repo: string } & T;
  }

  issue<T extends Record<string, unknown> = Record<string, never>>(
    data?: T,
  ): { issue_number: number; owner: string; repo: string } & T {
    return {
      issue_number: this.number,
      ...this.repo(data),
    } as { issue_number: number; owner: string; repo: string } & T;
  }

  pullRequest<T extends Record<string, unknown> = Record<string, never>>(
    data?: T,
  ): { pull_number: number; owner: string; repo: string } & T {
    return {
      pull_number: this.number,
      ...this.repo(data),
    } as { pull_number: number; owner: string; repo: string } & T;
  }

  fetchPRFiles(): Promise<ListPullRequestFiles> {
    if (!this.prFilesCache) {
      this.prFilesCache = this.github.paginate(this.github.pulls.listFiles, {
        ...this.pullRequest(),
        per_page: 100,
      });
      this.prFilesCache.catch(() => {
        this.prFilesCache = undefined;
      });
    }
    return this.prFilesCache;
  }

  /** Unique integration domains derived from PR file paths. Empty for issue contexts. */
  getIntegrationDomains(): Promise<string[]> {
    if (this.type !== WebhookContextType.PULL_REQUEST) return Promise.resolve([]);
    if (!this._caches.integrationDomains) {
      this._caches.integrationDomains = this.fetchPRFiles().then((files) => {
        const domains = new Set<string>();
        for (const file of files) {
          const parsed = new ParsedPath(file);
          if (parsed.component) domains.add(parsed.component);
        }
        return [...domains];
      });
      this._caches.integrationDomains.catch(() => {
        this._caches.integrationDomains = undefined;
      });
    }
    return this._caches.integrationDomains;
  }

  fetchIssueWithCache(params: GetIssueParams): Promise<GetIssueResponse> {
    const key = `${params.owner}/${params.repo}/${params.issue_number}`;
    let inflight = this._caches.issue.get(key);
    if (!inflight) {
      inflight = this.github.issues.get(params).then((r) => r.data);
      inflight.catch(() => this._caches.issue.delete(key));
      this._caches.issue.set(key, inflight);
    }
    return inflight;
  }

  fetchPullRequestWithCache(params: GetPullRequestParams): Promise<GetPullRequestResponse> {
    const key = `${params.owner}/${params.repo}/${params.pull_number}`;
    let inflight = this._caches.pullRequest.get(key);
    if (!inflight) {
      inflight = this.github.pulls.get(params).then((r) => r.data);
      inflight.catch(() => this._caches.pullRequest.delete(key));
      this._caches.pullRequest.set(key, inflight);
    }
    return inflight;
  }

  /** Body of the issue/PR in scope; payload first, falls back to a cached fetch. */
  async getBody(): Promise<string | null> {
    const payload = this.payload as {
      pull_request?: { body?: string | null };
      issue?: { body?: string | null };
    };
    if (payload.pull_request?.body != null) return payload.pull_request.body;
    if (payload.issue?.body != null) return payload.issue.body;

    try {
      if (this.type === WebhookContextType.PULL_REQUEST) {
        const pr = await this.fetchPullRequestWithCache(this.pullRequest());
        return pr.body ?? null;
      }
      const issue = await this.fetchIssueWithCache(this.issue());
      return issue.body ?? null;
    } catch (err) {
      console.warn("WebhookContext.getBody fetch failed:", err);
      return null;
    }
  }
}

function deriveContextType(payload: WebhookEventPayload): WebhookContextType {
  if ("pull_request" in payload && payload.pull_request) {
    return WebhookContextType.PULL_REQUEST;
  }
  // `issue_comment` events on a PR have the PR cross-link on `issue.pull_request`.
  if ("issue" in payload && payload.issue?.pull_request) {
    return WebhookContextType.PULL_REQUEST;
  }
  return WebhookContextType.ISSUE;
}
