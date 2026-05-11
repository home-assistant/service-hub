import { EventType } from "../github/types.js";
import type { Effect, Rule } from "../rules/types.js";

export function cleanupLabelsOnClose(config: { labels: string[] }): Rule {
  return {
    name: "label-cleaner",
    description: `Removes labels on PR close: ${config.labels.join(", ")}`,
    events: {
      [EventType.PULL_REQUEST_CLOSED]: async (ctx) => {
        const currentLabels = new Set(ctx.payload.pull_request.labels.map((l) => l.name));
        const toRemove = config.labels.filter((label) => currentLabels.has(label));
        if (toRemove.length === 0) return;
        return toRemove.map<Effect>((label) => ({ type: "removeLabel", label }));
      },
    },
  };
}
