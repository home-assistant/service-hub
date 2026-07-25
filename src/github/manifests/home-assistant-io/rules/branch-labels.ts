import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Effect, Rule } from "../../../engine/types.js";

/** Branches a docs PR may target, each mirrored by a label of the same name. */
export const DOCS_BRANCHES = new Set(["current", "rc", "next"]);

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  const baseRef = await ctx.target.baseRef();

  const effects: Effect[] = [];
  if (DOCS_BRANCHES.has(baseRef)) {
    effects.push({ type: "addLabels", labels: [baseRef] });
  }

  const stale = [...DOCS_BRANCHES].filter((branch) => branch !== baseRef);
  effects.push({ type: "removeLabels", labels: stale });

  return effects;
}

export const branchLabels: Rule = {
  name: "branch-labels",
  description:
    "Labels docs PRs with their target branch (`current`, `rc`, `next`) and removes " +
    "branch labels that no longer match.",
  allowBots: false,
  events: on(
    [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_EDITED, EventType.ON_DEMAND],
    evaluate,
  ),
};
