import type { Octokit } from "@octokit/rest";
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

export interface WebhookPayload {
  repository: {
    full_name: string;
    name: string;
    owner: { login: string };
  };
  sender: { login: string; type: string };
  number?: number;
  issue?: { number: number };
  pull_request?: { number: number; head?: { sha: string } };
  action?: string;
}

interface WebhookContextParams {
  github: Octokit;
  payload: WebhookPayload;
  eventType: EventType;
  db: Database;
}

export class WebhookContext {
  readonly github: Octokit;
  readonly eventType: EventType;
  readonly repository: Repository;
  readonly organization: Organization;
  readonly payload: WebhookPayload;
  readonly db: Database;

  _prFilesCache?: ListPullRequestFiles;
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
    return this.payload.pull_request?.head?.sha ?? "";
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
    const issueNumber =
      this.payload.issue?.number ?? this.payload.pull_request?.number ?? this.payload.number ?? 0;
    return {
      issue_number: issueNumber,
      ...this.repo(data),
    } as { issue_number: number; owner: string; repo: string } & T;
  }

  pullRequest<T extends Record<string, unknown> = Record<string, never>>(
    data?: T,
  ): { pull_number: number; owner: string; repo: string } & T {
    const pullNumber =
      (this.payload.issue ?? this.payload.pull_request ?? this.payload)?.number ?? 0;
    return {
      pull_number: pullNumber,
      ...this.repo(data),
    } as { pull_number: number; owner: string; repo: string } & T;
  }

  async fetchPRFiles(): Promise<ListPullRequestFiles> {
    if (!this._prFilesCache) {
      this._prFilesCache = (await this.github.pulls.listFiles(this.pullRequest())).data;
    }
    return this._prFilesCache;
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
