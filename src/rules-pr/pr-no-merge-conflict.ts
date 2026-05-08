import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";

export const prNoMergeConflict: Rule = {
  name: "pr-no-merge-conflict",
  description: "Requests changes when a PR has merge conflicts",
  listens: [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_SYNCHRONIZE],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    // Re-fetch since webhook payload data may be stale
    const { data: pr } = await context.github.pulls.get(context.pullRequest());

    if (pr.mergeable_state === "unknown") return; // GitHub hasn't computed yet
    if (pr.mergeable_state !== "dirty") return;

    return { requestChanges: "There is a merge conflict." };
  },
};
