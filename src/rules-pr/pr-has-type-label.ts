import type { PullRequestLabeledEvent, PullRequestUnlabeledEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";

export function requiredLabels(config: { labels: string[] }): Rule {
  return {
    name: "required-labels",
    description: `Requires one of: ${config.labels.join(", ")}`,
    listens: [
      EventType.PULL_REQUEST_LABELED,
      EventType.PULL_REQUEST_UNLABELED,
      EventType.PULL_REQUEST_SYNCHRONIZE,
    ],

    async handle(context: WebhookContext): Promise<RuleResult | undefined> {
      const payload = context.payload as PullRequestLabeledEvent | PullRequestUnlabeledEvent;
      const currentLabels = new Set(payload.pull_request.labels.map((l) => l.name));

      const hasRequiredLabel = config.labels.some((label) => currentLabels.has(label));

      return {
        statusCheck: {
          context: "required-labels",
          state: hasRequiredLabel ? "success" : "failure",
          description: hasRequiredLabel
            ? `Has at least one of the required labels (${config.labels.join(", ")})`
            : `Missing one of: ${config.labels.join(", ")}`,
        },
        dashboard: {
          id: "required-labels",
          title: "Required Labels",
          status: hasRequiredLabel ? "pass" : "fail",
          message: hasRequiredLabel
            ? "Has a required label"
            : `Missing one of: ${config.labels.join(", ")}`,
        },
      };
    },
  };
}
