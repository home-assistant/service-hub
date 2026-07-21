import type { Octokit } from "@octokit/rest";
import type { Env } from "../../env.js";
import { log } from "../../log.js";
import type { ItemRef } from "../../util/item-ref.js";
import { dispatch } from "./dispatch.js";
import { ruleContextFromIssue, ruleContextFromPullRequest } from "./model/rule-context.js";
import type { Effect, RegistryConfig } from "./types.js";

export async function evaluatePR(
  env: Env,
  registry: RegistryConfig,
  github: Octokit,
  ref: ItemRef,
): Promise<Effect[]> {
  const { data: pr } = await github.pulls.get({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
  });

  return dispatch(ruleContextFromPullRequest(env, registry, github, pr));
}

export async function evaluateIssue(
  env: Env,
  registry: RegistryConfig,
  github: Octokit,
  ref: ItemRef,
): Promise<Effect[]> {
  const { data: issue } = await github.issues.get({
    owner: ref.owner,
    repo: ref.repo,
    issue_number: ref.number,
  });

  // PRs and issues share a numbering space; issues.get happily returns the
  // issue view of a PR. Route those through the PR path so PR rules run.
  if (issue.pull_request) {
    return evaluatePR(env, registry, github, ref);
  }

  return dispatch(
    ruleContextFromIssue(env, registry, github, issue, { owner: ref.owner, repo: ref.repo }),
  );
}

export async function evaluateRecentPRs(
  env: Env,
  registry: RegistryConfig,
  github: Octokit,
  repoFullName: string,
  since: Date,
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
      await evaluatePR(env, registry, github, { owner, repo, number: pr.number });
    } catch (err) {
      log.error("evaluateRecentPRs: PR evaluation failed", {
        repository: repoFullName,
        number: pr.number,
        error: String(err),
      });
    }
  }
}
