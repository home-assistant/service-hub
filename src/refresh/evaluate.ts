import type { Octokit } from "@octokit/rest";
import type { WebhookPayload } from "../context/webhook-context.js";
import { WebhookContext } from "../context/webhook-context.js";
import type { Database } from "../db/types.js";
import { EventType } from "../github/types.js";
import type { RegistryConfig } from "../rules/registry.js";
import { dispatch } from "../rules/registry.js";

interface PRRef {
  owner: string;
  repo: string;
  number: number;
}

function prToPayload(pr: Awaited<ReturnType<Octokit["pulls"]["get"]>>["data"]): WebhookPayload {
  return {
    action: "synchronize",
    number: pr.number,
    repository: {
      full_name: `${pr.base.repo.owner.login}/${pr.base.repo.name}`,
      name: pr.base.repo.name,
      owner: { login: pr.base.repo.owner.login },
    },
    sender: { login: pr.user?.login ?? "", type: pr.user?.type ?? "User" },
    pull_request: {
      number: pr.number,
      head: { sha: pr.head.sha },
    },
  };
}

export async function evaluatePR(
  registryConfig: RegistryConfig,
  github: Octokit,
  db: Database,
  ref: PRRef,
): Promise<void> {
  const { data: pr } = await github.pulls.get({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
  });

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

  const cutoff = since.toISOString();
  const recentPRs = prs.data.filter((pr) => pr.updated_at >= cutoff);

  for (const pr of recentPRs) {
    try {
      await evaluatePR(registryConfig, github, db, {
        owner,
        repo,
        number: pr.number,
      });
    } catch (err) {
      console.error(`Failed to evaluate PR ${repoFullName}#${pr.number}:`, err);
    }
  }
}
