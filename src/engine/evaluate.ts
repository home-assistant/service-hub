import type { Octokit } from "@octokit/rest";
import type { GetPullRequestParams } from "../github/types.js";
import type { RegistryConfig } from "./dispatch.js";
import { dispatch } from "./dispatch.js";
import { contextFromPullRequest } from "./model/from-webhook.js";
import type { Effect } from "./types.js";

export interface EvaluateOptions {
  dryRun?: boolean;
  botSlug?: string;
  captureException?: (err: unknown) => void;
}

export async function evaluatePR(
  registryConfig: RegistryConfig,
  github: Octokit,
  params: GetPullRequestParams,
  options: EvaluateOptions = {},
): Promise<Effect[]> {
  const { data: pr } = await github.pulls.get(params);

  const context = contextFromPullRequest(github, pr, {
    botSlug: options.botSlug ?? "",
    dryRun: options.dryRun,
    captureException: options.captureException,
  });

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
      await evaluatePR(registryConfig, github, { owner, repo, pull_number: pr.number }, options);
    } catch (err) {
      console.error(`Failed to evaluate PR ${repoFullName}#${pr.number}:`, err);
    }
  }
}
