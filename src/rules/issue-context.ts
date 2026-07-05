import { EventType } from "../engine/event.js";
import { type CheckOutcome, check } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Rule } from "../engine/types.js";

type HandledEvent = EventType.ISSUES_LABELED | EventType.ISSUES_ON_DEMAND;

/**
 * Per-label reporting guidance on the issue dashboard (keys are full label
 * names, e.g. `integration: zha`, `custom integration`). Generic advice
 * lives in the dashboard's issue intro; this rule only carries extras.
 */
export function issueContext(labels: Record<string, string>): Rule {
  async function evaluate(
    ctx: RuleContext<HandledEvent>,
  ): Promise<CheckOutcome | "clear" | undefined> {
    if ("label" in ctx.event && !(ctx.event.label in labels)) return;

    const parts = (await ctx.target.labels()).flatMap((label) =>
      labels[label] ? [labels[label]] : [],
    );
    if (parts.length === 0) return "clear";

    return { status: "info", message: parts.join("\n\n") };
  }

  return check({
    id: "issue-context",
    title: "Reporting guidance",
    description: "Posts per-label reporting guidance on the issue dashboard",
    events: [EventType.ISSUES_LABELED, EventType.ISSUES_ON_DEMAND],
    evaluate,
  });
}
