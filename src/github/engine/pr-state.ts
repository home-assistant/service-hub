import type { Octokit } from "@octokit/rest";
import { log } from "../../log.js";
import type { RuleContext } from "./model/rule-context.js";

async function convertPullRequestToDraft(github: Octokit, nodeId: string): Promise<void> {
  await github.graphql(
    "mutation($id: ID!) { convertPullRequestToDraft(input: {pullRequestId: $id}) { clientMutationId } }",
    { id: nodeId },
  );
}

/** Convert the PR to draft unless it's already one */
export async function draftPRIfNotDraft(context: RuleContext): Promise<void> {
  if (context.target.kind !== "pull_request") return;
  try {
    if (await context.target.isDraft()) return;
    await convertPullRequestToDraft(context.github, await context.target.nodeId());
  } catch (err) {
    log.warn("draftPRIfNotDraft failed", { error: String(err) });
  }
}
