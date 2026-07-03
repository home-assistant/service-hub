import { EventType } from "../github/types.js";

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
  [EventType.ON_DEMAND]: { type: EventType.ON_DEMAND };
}

export type RuleEvent = RuleEventMap[EventType];
export type RuleEventOf<E extends EventType> = RuleEventMap[E];
