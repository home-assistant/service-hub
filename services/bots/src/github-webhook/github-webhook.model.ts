interface WebhookContextParams {
  payload: Record<string, any>;
  eventType: string;
}

export class WebhookContext {
  public eventType: string;
  public payload: Record<string, any>;
  public scheduledComments: { context: string; comment: string }[] = [];
  public scheduledlabels: string[] = [];

  constructor(params: WebhookContextParams) {
    this.eventType = params.eventType;
    this.payload = params.payload;
  }

  public repo<T>(data?: T) {
    return {
      owner: this.payload.repository.owner.login,
      repo: this.payload.repository.name,
      ...data,
    };
  }

  public issue<T>(data?: T) {
    return {
      issue_number: (this.payload.issue || this.payload.pull_request || this.payload).number,
      ...this.repo(data),
    };
  }

  public pullRequest<T>(data?: T) {
    return {
      pull_number: (this.payload.issue || this.payload.pull_request || this.payload).number,
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
