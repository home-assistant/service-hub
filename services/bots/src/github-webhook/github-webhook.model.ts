import { Octokit } from '@octokit/rest';
import {
  GetIssueParams,
  GetIssueResponse,
  GetPullRequestParams,
  GetPullRequestResponse,
  ListPullRequestFiles,
} from './github-webhook.const';

export class GithubClient extends Octokit {
  private _issueRequestCache: { [key: string]: GetIssueResponse } = {};
  private _pullRequestCache: { [key: string]: GetPullRequestResponse } = {};

  public async fetchIssueWithCache(params: GetIssueParams): Promise<GetIssueResponse> {
    const key = `${params.owner}/${params.repo}/${params.pull_number}`;
    if (!(key in this._issueRequestCache)) {
      this._issueRequestCache[key] = (await this.issues.get(params)).data;
    }
    return this._issueRequestCache[key];
  }
  public async fetchPullRequestWithCache(
    params: GetPullRequestParams,
  ): Promise<GetPullRequestResponse> {
    const key = `${params.owner}/${params.repo}/${params.pull_number}`;
    if (!(key in this._pullRequestCache)) {
      this._pullRequestCache[key] = (await this.pulls.get(params)).data;
    }
    return this._pullRequestCache[key];
  }
}

interface WebhookContextParams<E> {
  github: GithubClient;
  payload: E;
  eventType: string;
}

export class WebhookContext<E> {
  public github: GithubClient;
  public eventType: string;
  public payload: E;
  public scheduledComments: { handler: string; comment: string }[] = [];
  public scheduledlabels: string[] = [];

  public _prFiles?: ListPullRequestFiles;

  constructor(params: WebhookContextParams<E>) {
    this.github = params.github;
    this.eventType = params.eventType;
    this.payload = params.payload;
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

  public scheduleIssueComment(handler: string, comment: string): void {
    this.scheduledComments.push({ handler, comment });
  }

  public scheduleIssueLabel(label: string): void {
    this.scheduledlabels.push(label);
  }
}
