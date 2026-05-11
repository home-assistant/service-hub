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
import type { Database } from "../db/types.js";
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
  | PullRequestUnlabeledEvent;

interface WebhookContextParams {
  github: Octokit;
  payload: WebhookEventPayload;
  eventType: EventType;
  db: Database;
}

export class WebhookContext {
  readonly github: Octokit;
  readonly eventType: EventType;
  readonly repository: Repository;
  readonly organization: Organization;
  readonly payload: WebhookEventPayload;
  readonly db: Database;

  prFilesCache?: ListPullRequestFiles;
  private _issueCache = new Map<string, GetIssueResponse>();
  private _pullRequestCache = new Map<string, GetPullRequestResponse>();

  constructor(params: WebhookContextParams) {
    this.github = params.github;
    this.eventType = params.eventType;
    this.payload = params.payload;
    this.db = params.db;
    this.repository = params.payload.repository.full_name as Repository;
    this.organization = params.payload.repository.owner.login as Organization;
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

  repo<T extends Record<string, unknown> = Record<string, never>>(
    data?: T,
  ): { owner: string; repo: string } & T {
    return {
      owner: this.payload.repository.owner.login,
      repo: this.payload.repository.name,
      ...data,
    } as { owner: string; repo: string } & T;
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
}
