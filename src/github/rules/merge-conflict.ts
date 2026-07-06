import { EventType } from "../engine/event.js";
import { type CheckOutcome, check } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  const mergeableState = await ctx.target.mergeableState();

  // GitHub computes mergeable_state asynchronously; "unknown" means we should
  // wait for a later event. Don't emit anything yet — the row will appear on
  // the next dispatch when the state is settled.
  if (mergeableState === "unknown") return;

  const isDirty = mergeableState === "dirty";
  return {
    status: isDirty ? "fail" : "pass",
    message: isDirty ? "Branch has merge conflicts with the base." : "No merge conflicts.",
  };
}

export const mergeConflict = check({
  id: "merge-conflict",
  title: "Merge conflicts",
  description: "Surfaces merge-conflict state as a dashboard row",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
