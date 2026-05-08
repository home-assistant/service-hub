import type { PullRequestClosedEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";

export function cleanupLabelsOnClose(config: { labels: string[] }): Rule {
  return {
    name: "label-cleaner",
    description: `Removes labels on PR close: ${config.labels.join(", ")}`,
    listens: [EventType.PULL_REQUEST_CLOSED],

    async handle(context: WebhookContext): Promise<RuleResult | undefined> {
      const payload = context.payload as PullRequestClosedEvent;
      const currentLabels = new Set(payload.pull_request.labels.map((l) => l.name));
      const toRemove = config.labels.filter((label) => currentLabels.has(label));

      if (toRemove.length === 0) return;

      return { removeLabels: toRemove };
    },
  };
}
