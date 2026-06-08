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
  Organization,
  Repository,
} from "../github/types.js";
import type { OnDemandEvent } from "../rules/types.js";

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

  prFilesCache?: ListPullRequestFiles;
  private _issueCache = new Map<string, GetIssueResponse>();
  private _pullRequestCache = new Map<string, GetPullRequestResponse>();

  constructor(params: WebhookContextParams<P>) {
    this.github = params.github;
    this.eventType = params.eventType;
    this.payload = params.payload;
    this.botSlug = params.botSlug;
    this.dryRun = params.dryRun ?? false;
    this.repository = params.payload.repository.full_name as Repository;
    this.organization = params.payload.repository.owner.login as Organization;
    this.type = deriveContextType(params.payload);
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

  async fetchPRFiles(): Promise<ListPullRequestFiles> {
    if (!this.prFilesCache) {
      this.prFilesCache = await this.github.paginate(this.github.pulls.listFiles, {
        ...this.pullRequest(),
        per_page: 100,
      });
    }
    return this.prFilesCache;
  }

  async fetchIssueWithCache(params: GetIssueParams): Promise<GetIssueResponse> {
    const key = `${params.owner}/${params.repo}/${params.issue_number}`;
    const cached = this._issueCache.get(key);
    if (cached) return cached;

    const result = (await this.github.issues.get(params)).data;
    this._issueCache.set(key, result);
    return result;
  }

  async fetchPullRequestWithCache(params: GetPullRequestParams): Promise<GetPullRequestResponse> {
    const key = `${params.owner}/${params.repo}/${params.pull_number}`;
    const cached = this._pullRequestCache.get(key);
    if (cached) return cached;

    const result = (await this.github.pulls.get(params)).data;
    this._pullRequestCache.set(key, result);
    return result;
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
