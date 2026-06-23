import type { RestEndpointMethodTypes } from "@octokit/rest";

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
   * Synthetic event to reavaluate a rule.
   */
  ON_DEMAND = "on_demand",
}

export type ListPullRequestFiles =
  RestEndpointMethodTypes["pulls"]["listFiles"]["response"]["data"];
export type GetPullRequestParams = RestEndpointMethodTypes["pulls"]["get"]["parameters"];
export type GetPullRequestResponse = RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];
export type GetIssueParams = RestEndpointMethodTypes["issues"]["get"]["parameters"];
export type GetIssueResponse = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];
