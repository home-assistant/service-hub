import type { PullRequestEditedEvent, PullRequestOpenedEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";

export function branchLabel(config: { validLabels: string[] }): Rule {
  const validLabelSet = new Set(config.validLabels);
  return {
    name: "docs-pr-branch-label",
    description: `Syncs branch labels (${config.validLabels.join(", ")}) with PR target branch`,
    allowBots: false,
    listens: [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_EDITED],

    async handle(context: WebhookContext): Promise<RuleResult | undefined> {
      const payload = context.payload as PullRequestOpenedEvent | PullRequestEditedEvent;
      const targetBranch = payload.pull_request.base.ref;
      const currentLabels = payload.pull_request.labels.map((l) => l.name);

      const result: RuleResult = {};

      if (validLabelSet.has(targetBranch) && !currentLabels.includes(targetBranch)) {
        result.labels = [targetBranch];
      }

      const toRemove = currentLabels.filter((l) => validLabelSet.has(l) && l !== targetBranch);
      if (toRemove.length > 0) {
        result.removeLabels = toRemove;
      }

      if (result.labels || result.removeLabels) return result;
    },
  };
}
