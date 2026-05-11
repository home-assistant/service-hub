import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";

type LabelEventTypes =
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_SYNCHRONIZE;

export function requiredLabels(config: { labels: string[] }): Rule {
  function evaluate(context: WebhookContext<EventPayloadMap[LabelEventTypes]>): Effect[] {
    const currentLabels = new Set(context.payload.pull_request.labels.map((l) => l.name));
    const hasRequiredLabel = config.labels.some((label) => currentLabels.has(label));

    return [
      {
        type: "statusCheck",
        sha: context.payload.pull_request.head.sha,
        context: "required-labels",
        state: hasRequiredLabel ? "success" : "failure",
        description: hasRequiredLabel
          ? `Has at least one of the required labels (${config.labels.join(", ")})`
          : `Missing one of: ${config.labels.join(", ")}`,
      },
      {
        type: "dashboardSection",
        section: {
          id: "required-labels",
          title: "Required Labels",
          status: hasRequiredLabel ? "pass" : "fail",
          message: hasRequiredLabel
            ? "Has a required label"
            : `Missing one of: ${config.labels.join(", ")}`,
        },
      },
    ];
  }

  return {
    name: "required-labels",
    description: `Requires one of: ${config.labels.join(", ")}`,
    events: {
      [EventType.PULL_REQUEST_LABELED]: async (ctx) => evaluate(ctx),
      [EventType.PULL_REQUEST_UNLABELED]: async (ctx) => evaluate(ctx),
      [EventType.PULL_REQUEST_SYNCHRONIZE]: async (ctx) => evaluate(ctx),
    },
  };
}
