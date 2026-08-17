import type { Octokit } from "@octokit/rest";
import type { Env } from "../../env.js";
import type { ItemRef } from "../../util/item-ref.js";
import { type DispatchResult, dispatch } from "./dispatch.js";
import { ruleContextFromIssue, ruleContextFromPullRequest } from "./model/rule-context.js";
import type { RegistryConfig } from "./types.js";

export async function evaluatePR(
  env: Env,
  registry: RegistryConfig,
  github: Octokit,
  ref: ItemRef,
): Promise<DispatchResult> {
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
): Promise<DispatchResult> {
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
