import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../engine/rule.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  const mergeableState = await ctx.target.mergeableState();

  // GitHub computes mergeable_state asynchronously and resets it to "unknown"
  // on every push, so the synchronize dispatch that follows a push usually
  // reads "unknown". Returning undefined here would carry a previously
  // persisted "fail" row forward — re-drafting the PR (and re-blocking merge)
  // on the very push that fixed the conflict, with no event to correct it.
  // Report "pass" so the stale fail is cleared; a genuine conflict re-fails on
  // the next event once GitHub has settled the state.
  if (mergeableState === "unknown") {
    return { status: "pass", message: "Merge status is being recalculated by GitHub." };
  }

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
