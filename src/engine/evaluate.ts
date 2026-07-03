import type { Octokit } from "@octokit/rest";
import type { RegistryConfig } from "./dispatch.js";
import { dispatch } from "./dispatch.js";
import { contextFromIssue, contextFromPullRequest } from "./model/from-webhook.js";
import type { IssueRef } from "./model/issue.js";
import type { PullRequestRef } from "./model/pull-request.js";
import type { Effect } from "./types.js";

export interface EvaluateOptions {
  dryRun?: boolean;
  botSlug?: string;
  captureException?: (err: unknown) => void;
}

export async function evaluatePR(
  registryConfig: RegistryConfig,
  github: Octokit,
  ref: PullRequestRef,
  options: EvaluateOptions = {},
): Promise<Effect[]> {
  const { data: pr } = await github.pulls.get({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
  });

  const context = contextFromPullRequest(github, pr, {
    botSlug: options.botSlug ?? "",
    dryRun: options.dryRun,
    captureException: options.captureException,
  });

  return dispatch(registryConfig, context);
}

export async function evaluateIssue(
  registryConfig: RegistryConfig,
  github: Octokit,
  ref: IssueRef,
  options: EvaluateOptions = {},
): Promise<Effect[]> {
  const { data: issue } = await github.issues.get({
    owner: ref.owner,
    repo: ref.repo,
    issue_number: ref.number,
  });

  // PRs and issues share a numbering space; issues.get happily returns the
  // issue view of a PR. Route those through the PR path so PR rules run.
  if (issue.pull_request) {
    return evaluatePR(registryConfig, github, ref, options);
  }

  const context = contextFromIssue(
    github,
    issue,
    { owner: ref.owner, repo: ref.repo },
    {
      botSlug: options.botSlug ?? "",
      dryRun: options.dryRun,
      captureException: options.captureException,
    },
  );

  return dispatch(registryConfig, context);
}

export async function evaluateRecentPRs(
  registryConfig: RegistryConfig,
  github: Octokit,
  repoFullName: string,
  since: Date,
  options: EvaluateOptions = {},
): Promise<void> {
  const [owner, repo] = repoFullName.split("/");
  const prs = await github.pulls.list({
    owner,
    repo,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  });

  const recentPRs = prs.data.filter((pr) => new Date(pr.updated_at) >= since);

  for (const pr of recentPRs) {
    try {
      await evaluatePR(registryConfig, github, { owner, repo, number: pr.number }, options);
    } catch (err) {
      console.error(`Failed to evaluate PR ${repoFullName}#${pr.number}:`, err);
    }
  }
}
