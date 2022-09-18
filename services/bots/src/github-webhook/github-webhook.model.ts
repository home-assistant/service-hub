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

  public get issueContext() {
    return {
      issue_number: this.payload.number,
      pull_number: this.payload.number,
      owner: this.payload.repository.owner.login,
      repo: this.payload.repository.name,
    };
  }

  public scheduleIssueComment(context: string, comment: string): void {
    this.scheduledComments.push({ context, comment });
  }

  public scheduleIssueLabel(label: string): void {
    this.scheduledlabels.push(label);
  }
}
