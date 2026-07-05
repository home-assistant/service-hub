import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

const SECTION_ID = "merge-conflict";
const SECTION_TITLE = "Merge conflicts";

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  const mergeableState = await ctx.target.mergeableState();

  // GitHub computes mergeable_state asynchronously; "unknown" means we should
  // wait for a later event. Don't emit anything yet — the row will appear on
  // the next dispatch when the state is settled.
  if (mergeableState === "unknown") return;

  const isDirty = mergeableState === "dirty";
  return [
    {
      type: "dashboardSection",
      section: {
        id: SECTION_ID,
        title: SECTION_TITLE,
        status: isDirty ? "fail" : "pass",
        message: isDirty ? "Branch has merge conflicts with the base." : "No merge conflicts.",
      },
    },
  ];
}

export const mergeConflict: Rule = {
  name: "merge-conflict",
  description: "Surfaces merge-conflict state as a dashboard row",
  dashboardSections: [SECTION_ID],
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_REOPENED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
