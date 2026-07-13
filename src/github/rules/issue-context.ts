import { EventType } from "../engine/event.js";
import { type CheckOutcome, check } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Rule } from "../engine/types.js";
import { domainsFromIssueBody, INTEGRATION_LABEL_PREFIX } from "./integrations.js";

type HandledEvent = EventType.ISSUES_OPENED | EventType.ISSUES_LABELED | EventType.ISSUES_ON_DEMAND;

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

    // Labels on the issue plus the integration labels its body implies, so
    // guidance shows up on opened without waiting for the labelling rule.
    const derived = (await domainsFromIssueBody(await ctx.target.body())).map(
      (d) => `${INTEGRATION_LABEL_PREFIX}${d}`,
    );
    const effective = new Set([...(await ctx.target.labels()), ...derived]);
    const parts = [...effective].flatMap((label) => (labels[label] ? [labels[label]] : []));
    if (parts.length === 0) return "clear";

    return { status: "info", message: parts.join("\n\n") };
  }

  return check({
    id: "issue-context",
    title: "Reporting guidance",
    description: "Posts per-label reporting guidance on the issue dashboard",
    events: [EventType.ISSUES_OPENED, EventType.ISSUES_LABELED, EventType.ISSUES_ON_DEMAND],
    evaluate,
  });
}
