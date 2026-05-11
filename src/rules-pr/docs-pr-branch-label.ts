import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";

export function branchLabel(config: { validLabels: string[] }): Rule {
  const validLabelSet = new Set(config.validLabels);

  function evaluate(
    ctx: WebhookContext<
      | EventPayloadMap[EventType.PULL_REQUEST_OPENED]
      | EventPayloadMap[EventType.PULL_REQUEST_EDITED]
    >,
  ): Effect[] | undefined {
    const targetBranch = ctx.payload.pull_request.base.ref;
    const currentLabels = ctx.payload.pull_request.labels.map((l) => l.name);

    const effects: Effect[] = [];
    if (validLabelSet.has(targetBranch) && !currentLabels.includes(targetBranch)) {
      effects.push({ type: "addLabels", labels: [targetBranch] });
    }
    for (const l of currentLabels) {
      if (validLabelSet.has(l) && l !== targetBranch) {
        effects.push({ type: "removeLabel", label: l });
      }
    }
    return effects.length ? effects : undefined;
  }

  return {
    name: "docs-pr-branch-label",
    description: `Syncs branch labels (${config.validLabels.join(", ")}) with PR target branch`,
    allowBots: false,
    events: {
      [EventType.PULL_REQUEST_OPENED]: async (ctx) => evaluate(ctx),
      [EventType.PULL_REQUEST_EDITED]: async (ctx) => evaluate(ctx),
    },
  };
}
