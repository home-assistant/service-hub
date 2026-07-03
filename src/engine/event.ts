import type { EventType } from "../github/types.js";

/**
 * What happened, as a small fully-known descriptor — one variant per
 * EventType. Entity *state* (labels, body, …) lives on the target
 * PullRequest/Issue model, not here; an event only carries facts about the
 * transition itself.
 */
export type RuleEvent =
  | { type: EventType.ISSUE_COMMENT_CREATED; commentId: number; commentBody: string }
  | { type: EventType.ISSUES_LABELED; label: string }
  | { type: EventType.ISSUES_OPENED }
  | { type: EventType.PULL_REQUEST_CLOSED; merged: boolean }
  | { type: EventType.PULL_REQUEST_EDITED }
  | { type: EventType.PULL_REQUEST_LABELED; label: string }
  | { type: EventType.PULL_REQUEST_OPENED }
  | { type: EventType.PULL_REQUEST_REOPENED }
  | { type: EventType.PULL_REQUEST_READY_FOR_REVIEW }
  | { type: EventType.PULL_REQUEST_REVIEW_SUBMITTED; reviewState: string; reviewer: string }
  | { type: EventType.PULL_REQUEST_SYNCHRONIZE }
  | { type: EventType.PULL_REQUEST_UNLABELED; label: string }
  | { type: EventType.ON_DEMAND };

export type RuleEventOf<E extends EventType> = Extract<RuleEvent, { type: E }>;
