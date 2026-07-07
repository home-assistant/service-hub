import { EventType } from "../engine/event.js";
import { on } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";

type HandledEvent =
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

export function blockingLabels(
  config: Record<string, { message: string; success?: string }>,
): Rule {
  async function buildEffects(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
    const currentLabels = new Set(await ctx.target.labels());

    // On labeled/unlabeled, only the affected label's status can change.
    // On synchronize/on_demand, every configured label must be re-emitted
    // (a missing status leaves required checks in "expected" state).
    const affectedLabel = "label" in ctx.event ? ctx.event.label : undefined;

    const labelsToEmit = Object.keys(config).filter(
      (label) => !affectedLabel || affectedLabel === label,
    );

    if (labelsToEmit.length === 0) return;

    return labelsToEmit.map<Effect>((label) => {
      const description = config[label];
      const hasBlockingLabel = currentLabels.has(label);
      return {
        type: "dashboardSection",
        section: {
          id: `blocking-label-${label.toLowerCase().replaceAll(" ", "-")}`,
          title: `Blocking: ${label}`,
          status: hasBlockingLabel ? "fail" : "skip",
          message: hasBlockingLabel
            ? description.message
            : `\`${label}\` label not set — nothing to block.`,
        },
      };
    });
  }

  const dashboardSections = Object.keys(config).map((label) => ({
    id: `blocking-label-${label.toLowerCase().replaceAll(" ", "-")}`,
    title: `Blocking: ${label}`,
  }));

  return {
    name: "blocking-labels",
    description: `Blocks PRs with labels: ${Object.keys(config).join(", ")}`,
    dashboardSections,
    events: on(
      [
        EventType.PULL_REQUEST_LABELED,
        EventType.PULL_REQUEST_UNLABELED,
        EventType.PULL_REQUEST_SYNCHRONIZE,
        EventType.ON_DEMAND,
      ],
      buildEffects,
    ),
  };
}
