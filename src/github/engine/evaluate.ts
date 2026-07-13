import type { Octokit } from "@octokit/rest";
import type { Env } from "../../env.js";
import { log } from "../../log.js";
import type { RegistryConfig } from "./dispatch.js";
import { dispatch } from "./dispatch.js";
import { contextFromIssue, contextFromPullRequest } from "./model/from-webhook.js";
import type { IssueRef } from "./model/issue.js";
import type { PullRequestRef } from "./model/pull-request.js";
import type { Effect } from "./types.js";

export async function evaluatePR(
  github: Octokit,
  ref: PullRequestRef,
  env: Env,
  registry: RegistryConfig,
): Promise<Effect[]> {
  const { data: pr } = await github.pulls.get({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
  });

  return dispatch(contextFromPullRequest(env, registry, github, pr));
}

export async function evaluateIssue(
  github: Octokit,
  ref: IssueRef,
  env: Env,
  registry: RegistryConfig,
): Promise<Effect[]> {
  const { data: issue } = await github.issues.get({
    owner: ref.owner,
    repo: ref.repo,
    issue_number: ref.number,
  });

  // PRs and issues share a numbering space; issues.get happily returns the
  // issue view of a PR. Route those through the PR path so PR rules run.
  if (issue.pull_request) {
    return evaluatePR(github, ref, env, registry);
  }

  return dispatch(
    contextFromIssue(env, registry, github, issue, { owner: ref.owner, repo: ref.repo }),
  );
}

export async function evaluateRecentPRs(
  github: Octokit,
  repoFullName: string,
  since: Date,
  env: Env,
  registry: RegistryConfig,
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
      await evaluatePR(github, { owner, repo, number: pr.number }, env, registry);
    } catch (err) {
      log.error("evaluateRecentPRs: PR evaluation failed", {
        repository: repoFullName,
        number: pr.number,
        error: String(err),
      });
    }
  }
}
