import { Issue, PullRequest } from '@octokit/webhooks-types';
import { IssuesEventData, PullRequestEventData } from '../github-webhook.const';

// PRs are shaped as issues. This method will help normalize it.
export const issueFromPayload = (
  payload: IssuesEventData | PullRequestEventData,
): Issue | PullRequest => payload['pull_request'] || payload['issue'];
