import type { Octokit } from "@octokit/rest";
import type { PullRequestSynchronizeEvent } from "@octokit/webhooks-types";
import { WebhookContext } from "../context/webhook-context.js";
import type { Database } from "../db/types.js";
import type { GetPullRequestParams } from "../github/types.js";
import { EventType } from "../github/types.js";
import type { RegistryConfig } from "../rules/dispatch.js";
import { dispatch } from "../rules/dispatch.js";

function prToPayload(
  pr: Awaited<ReturnType<Octokit["pulls"]["get"]>>["data"],
): PullRequestSynchronizeEvent {
  return {
    action: "synchronize",
    number: pr.number,
    before: "",
    after: pr.head.sha,
    repository: pr.base.repo,
    sender: pr.user ?? { login: "", type: "User" },
    pull_request: pr,
    installation: undefined,
    organization: undefined,
  } as unknown as PullRequestSynchronizeEvent;
}

export async function evaluatePR(
  registryConfig: RegistryConfig,
  github: Octokit,
  db: Database,
  params: GetPullRequestParams,
): Promise<void> {
  const { data: pr } = await github.pulls.get(params);

  const payload = prToPayload(pr);
  const context = new WebhookContext({
    github,
    payload,
    eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
    db,
  });

  await dispatch(registryConfig, context);
}

export async function evaluateRecentPRs(
  registryConfig: RegistryConfig,
  github: Octokit,
  db: Database,
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
      await evaluatePR(registryConfig, github, db, {
        owner,
        repo,
        pull_number: pr.number,
      });
    } catch (err) {
      console.error(`Failed to evaluate PR ${repoFullName}#${pr.number}:`, err);
    }
  }
}
