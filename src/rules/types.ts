import type {
  IssueCommentCreatedEvent,
  IssuesLabeledEvent,
  IssuesOpenedEvent,
  PullRequestClosedEvent,
  PullRequestEditedEvent,
  PullRequestLabeledEvent,
  PullRequestOpenedEvent,
  PullRequestReadyForReviewEvent,
  PullRequestReopenedEvent,
  PullRequestReviewSubmittedEvent,
  PullRequestSynchronizeEvent,
  PullRequestUnlabeledEvent,
} from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import type { DashboardSection } from "../dashboard/types.js";
import { EventType } from "../github/types.js";

/**
 * Maps each EventType to its strongly-typed webhook payload. Rules
 * declare handlers per event; the dispatcher narrows `context.payload`
 * to the matching type, so handler bodies do not need a cast.
 */
export interface EventPayloadMap {
  [EventType.ISSUE_COMMENT_CREATED]: IssueCommentCreatedEvent;
  [EventType.ISSUES_LABELED]: IssuesLabeledEvent;
  [EventType.ISSUES_OPENED]: IssuesOpenedEvent;
  [EventType.PULL_REQUEST_CLOSED]: PullRequestClosedEvent;
  [EventType.PULL_REQUEST_EDITED]: PullRequestEditedEvent;
  [EventType.PULL_REQUEST_LABELED]: PullRequestLabeledEvent;
  [EventType.PULL_REQUEST_OPENED]: PullRequestOpenedEvent;
  [EventType.PULL_REQUEST_REOPENED]: PullRequestReopenedEvent;
  [EventType.PULL_REQUEST_READY_FOR_REVIEW]: PullRequestReadyForReviewEvent;
  [EventType.PULL_REQUEST_REVIEW_SUBMITTED]: PullRequestReviewSubmittedEvent;
  [EventType.PULL_REQUEST_SYNCHRONIZE]: PullRequestSynchronizeEvent;
  [EventType.PULL_REQUEST_UNLABELED]: PullRequestUnlabeledEvent;
}

/**
 * Structured side-effects returned by a rule's event handler.
 * The dispatcher batches, deduplicates, and applies them. Rules never
 * call mutating GitHub or DB APIs directly.
 */
export type Effect =
  | { type: "addLabels"; labels: string[] }
  | { type: "removeLabel"; label: string }
  | {
      type: "statusCheck";
      sha: string;
      context: string;
      state: "success" | "failure" | "pending";
      description: string;
    }
  | { type: "comment"; body: string }
  | { type: "requestChanges"; body: string }
  | { type: "addAssignees"; assignees: string[] }
  | { type: "dashboardSection"; section: DashboardSection }
  | {
      type: "crossRepoAddLabels";
      owner: string;
      repo: string;
      issue_number: number;
      labels: string[];
    }
  | {
      type: "updatePullRequest";
      owner: string;
      repo: string;
      pull_number: number;
      state: "open" | "closed";
    }
  | {
      type: "convertPullRequestToDraft";
      node_id: string;
    }
  | { type: "updateComment"; comment_id: number; body: string }
  | {
      type: "requestReviewers";
      reviewers: string[];
    }
  | { type: "dismissReview"; review_id: number; message: string };

export type EventHandler<E extends keyof EventPayloadMap> = (
  context: WebhookContext<EventPayloadMap[E]>,
) => Promise<Effect[] | undefined>;

export type EventHandlers = {
  [E in keyof EventPayloadMap]?: EventHandler<E>;
};

export interface Rule {
  name: string;
  description: string;
  allowBots?: boolean;
  /**
   * Dashboard section IDs this rule may emit. The dispatcher takes the union
   * across all rules registered for the repo/org and uses it to sweep stale
   * sections out of the dashboard comment — any section in the existing
   * comment whose ID isn't claimed by some live rule gets removed on the
   * next dashboard write.
   */
  dashboardSections?: readonly string[];
  events: EventHandlers;
}
