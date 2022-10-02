import { Octokit } from '@octokit/rest';
import {
  EventType,
  GetIssueLabelParams,
  GetIssueLabelResponse,
  GetIssueParams,
  GetIssueResponse,
  GetPullRequestParams,
  GetPullRequestResponse,
  ListPullRequestFiles,
  Repository,
} from './github-webhook.const';

export class GithubClient extends Octokit {
  async issuesGetLabel(params: GetIssueLabelParams): Promise<GetIssueLabelResponse | undefined> {
    try {
      const labelResponse = await this.issues.getLabel(params);
      if (labelResponse.status === 200) {
        return labelResponse.data;
      }
    } catch (_err) {
      // Sometimes Github responds with 404 directly,
      // sometimes it does not, and only changes the response.status to 404
    }
  }
}

interface WebhookContextParams<E> {
  github: GithubClient;
  payload: E;
  eventType: EventType;
}

export class WebhookContext<E> {
  public github: GithubClient;
  public eventType: EventType;
  public repositoryName: Repository;
  public payload: E;
  public scheduledComments: { handler: string; comment: string; priority?: number }[] = [];
  public scheduledlabels: string[] = [];

  public _prFilesCache?: ListPullRequestFiles;
  private _issueRequestCache: { [key: string]: GetIssueResponse } = {};
  private _pullRequestCache: { [key: string]: GetPullRequestResponse } = {};

  constructor(params: WebhookContextParams<E>) {
    this.github = params.github;
    this.eventType = params.eventType;
    this.payload = params.payload;
    this.repositoryName = (params.payload as any).repository.name;
  }

  public get senderIsBot(): boolean {
    return (
      (this.payload as any).sender.type === 'Bot' ||
      (this.payload as any).sender.login === 'homeassistant'
    );
  }

  public repo<T>(data?: T): { owner: string; repo: string } & T {
    return {
      owner: (this.payload as any).repository.owner.login,
      repo: (this.payload as any).repository.name,
      ...data,
    };
  }

  public issue<T>(data?: T) {
    return {
      issue_number: ((this.payload as any).issue?.number ||
        (this.payload as any).pull_request?.number ||
        (this.payload as any)?.number) as number,
      ...this.repo(data),
    };
  }

  public pullRequest<T>(data?: T) {
    return {
      pull_number: (
        (this.payload as any).issue ||
        (this.payload as any).pull_request ||
        this.payload
      ).number as number,
      ...this.repo(data),
    };
  }

  public scheduleIssueComment(params: {
    handler: string;
    comment: string;
    priority?: number;
  }): void {
    this.scheduledComments.push(params);
  }

  public scheduleIssueLabel(label: string): void {
    this.scheduledlabels.push(label);
  }

  public async fetchIssueWithCache(params: GetIssueParams): Promise<GetIssueResponse> {
    const key = `${params.owner}/${params.repo}/${params.pull_number}`;
    if (!(key in this._issueRequestCache)) {
      this._issueRequestCache[key] = (await this.github.issues.get(params)).data;
    }
    return this._issueRequestCache[key];
  }
  public async fetchPullRequestWithCache(
    params: GetPullRequestParams,
  ): Promise<GetPullRequestResponse> {
    const key = `${params.owner}/${params.repo}/${params.pull_number}`;
    if (!(key in this._pullRequestCache)) {
      this._pullRequestCache[key] = (await this.github.pulls.get(params)).data;
    }
    return this._pullRequestCache[key];
  }
}
