import type { Octokit } from "@octokit/rest";
import type { GetPullRequestParams } from "../github/types.js";
import { EventType } from "../github/types.js";
import { WebhookContext } from "./context.js";
import type { RegistryConfig } from "./dispatch.js";
import { dispatch } from "./dispatch.js";
import type { Effect, OnDemandEvent } from "./types.js";

export interface EvaluateOptions {
  dryRun?: boolean;
  botSlug?: string;
}

export async function evaluatePR(
  registryConfig: RegistryConfig,
  github: Octokit,
  params: GetPullRequestParams,
  options: EvaluateOptions = {},
): Promise<Effect[]> {
  const { data: pr } = await github.pulls.get(params);

  const payload: OnDemandEvent = {
    action: "on_demand",
    pull_request: pr,
    repository: pr.base.repo,
    sender: pr.user
      ? { login: pr.user.login, type: pr.user.type === "Bot" ? "Bot" : "User" }
      : { login: "", type: "User" },
  };

  const context = new WebhookContext({
    github,
    payload,
    eventType: EventType.ON_DEMAND,
    botSlug: options.botSlug ?? "",
    dryRun: options.dryRun,
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
