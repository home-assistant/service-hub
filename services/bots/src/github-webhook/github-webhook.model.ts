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

  public get baseContext() {
    return {
      owner: this.payload.repository.owner.login,
      repo: this.payload.repository.name,
    };
  }

  public get issueContext() {
    return {
      ...this.baseContext,
      issue_number: this.payload.number,
    };
  }

  public get pullContext() {
    return {
      ...this.baseContext,
      pull_number: this.payload.number,
    };
  }

  public scheduleIssueComment(context: string, comment: string): void {
    this.scheduledComments.push({ context, comment });
  }

  public scheduleIssueLabel(label: string): void {
    this.scheduledlabels.push(label);
  }
}
