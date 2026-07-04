export enum EventType {
  ISSUE_COMMENT_CREATED = "issue_comment.created",
  ISSUES_LABELED = "issues.labeled",
  ISSUES_OPENED = "issues.opened",
  PULL_REQUEST_CLOSED = "pull_request.closed",
  PULL_REQUEST_EDITED = "pull_request.edited",
  PULL_REQUEST_LABELED = "pull_request.labeled",
  PULL_REQUEST_OPENED = "pull_request.opened",
  PULL_REQUEST_REOPENED = "pull_request.reopened",
  PULL_REQUEST_READY_FOR_REVIEW = "pull_request.ready_for_review",
  PULL_REQUEST_REVIEW_SUBMITTED = "pull_request_review.submitted",
  PULL_REQUEST_SYNCHRONIZE = "pull_request.synchronize",
  PULL_REQUEST_UNLABELED = "pull_request.unlabeled",

  /**
   * Repo-scoped (the only action-less webhook we consume): there is no
   * target PR/issue, so `context.target` is null and label/dashboard
   * effects don't apply. Rules get the pushed ref and the touched paths.
   */
  PUSH = "push",

  /**
   * Synthetic PR event to reevaluate a rule (cron sweep, `/<slug> update`).
   */
  ON_DEMAND = "on_demand",

  /**
   * Synthetic issue counterpart of ON_DEMAND (`/<slug> update` on an issue).
   */
  ISSUES_ON_DEMAND = "issues.on_demand",
}

/**
 * What happened, as a small fully-known descriptor — one entry per
 * EventType. Entity *state* (labels, body, …) lives on the target
 * PullRequest/Issue model, not here; an event only carries facts about the
 * transition itself.
 *
 * A lookup interface (not a conditional type) so RuleContext<E> stays
 * covariant in E — handlers written against an event union accept the
 * narrower per-event contexts.
 */
export interface RuleEventMap {
  [EventType.ISSUE_COMMENT_CREATED]: {
    type: EventType.ISSUE_COMMENT_CREATED;
    commentId: number;
    commentBody: string;
  };
  [EventType.ISSUES_LABELED]: { type: EventType.ISSUES_LABELED; label: string };
  [EventType.ISSUES_OPENED]: { type: EventType.ISSUES_OPENED };
  [EventType.PULL_REQUEST_CLOSED]: { type: EventType.PULL_REQUEST_CLOSED; merged: boolean };
  [EventType.PULL_REQUEST_EDITED]: { type: EventType.PULL_REQUEST_EDITED };
  [EventType.PULL_REQUEST_LABELED]: { type: EventType.PULL_REQUEST_LABELED; label: string };
  [EventType.PULL_REQUEST_OPENED]: { type: EventType.PULL_REQUEST_OPENED };
  [EventType.PULL_REQUEST_REOPENED]: { type: EventType.PULL_REQUEST_REOPENED };
  [EventType.PULL_REQUEST_READY_FOR_REVIEW]: { type: EventType.PULL_REQUEST_READY_FOR_REVIEW };
  [EventType.PULL_REQUEST_REVIEW_SUBMITTED]: {
    type: EventType.PULL_REQUEST_REVIEW_SUBMITTED;
    reviewState: string;
    reviewer: string;
  };
  [EventType.PULL_REQUEST_SYNCHRONIZE]: { type: EventType.PULL_REQUEST_SYNCHRONIZE };
  [EventType.PULL_REQUEST_UNLABELED]: { type: EventType.PULL_REQUEST_UNLABELED; label: string };
  [EventType.PUSH]: {
    type: EventType.PUSH;
    /** Full ref, e.g. "refs/heads/dev". */
    ref: string;
    toDefaultBranch: boolean;
    /** Paths added, modified, or removed across the push's commits. */
    touched: string[];
  };
  [EventType.ON_DEMAND]: { type: EventType.ON_DEMAND };
  [EventType.ISSUES_ON_DEMAND]: { type: EventType.ISSUES_ON_DEMAND };
}

export type RuleEvent = RuleEventMap[EventType];
export type RuleEventOf<E extends EventType> = RuleEventMap[E];
