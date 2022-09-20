import { Octokit } from '@octokit/rest';

interface WebhookContextParams<E> {
  github: Octokit;
  payload: E;
  eventType: string;
}

export class WebhookContext<E> {
  public github: Octokit;
  public eventType: string;
  public payload: E;
  public scheduledComments: { context: string; comment: string }[] = [];
  public scheduledlabels: string[] = [];

  constructor(params: WebhookContextParams<E>) {
    this.github = params.github;
    this.eventType = params.eventType;
    this.payload = params.payload;
  }

  public repo<T>(data?: T): { owner: string; repo: string } & T {
    return {
      owner: (this.payload as any).repository.owner.login,
      repo: (this.payload as any).name,
      ...data,
    };
  }

  public issue<T>(data?: T) {
    return {
      issue_number: (
        (this.payload as any).issue ||
        (this.payload as any).pull_request ||
        this.payload
      ).number as number,
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

  public scheduleIssueComment(context: string, comment: string): void {
    this.scheduledComments.push({ context, comment });
  }

  public scheduleIssueLabel(label: string): void {
    this.scheduledlabels.push(label);
  }
}
