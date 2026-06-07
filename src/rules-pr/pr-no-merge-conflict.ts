import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";

type MergeEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE;

const SECTION_ID = "merge-conflict";
const SECTION_TITLE = "Merge conflicts";

async function evaluate(
  ctx: WebhookContext<EventPayloadMap[MergeEvent]>,
): Promise<Effect[] | undefined> {
  const { data: pr } = await ctx.github.pulls.get(ctx.pullRequest());

  // GitHub computes mergeable_state asynchronously; "unknown" means we should
  // wait for a later event. Don't emit anything yet — the row will appear on
  // the next dispatch when the state is settled.
  if (pr.mergeable_state === "unknown") return;

  const isDirty = pr.mergeable_state === "dirty";
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

export const prNoMergeConflict: Rule = {
  name: "pr-no-merge-conflict",
  description: "Surfaces merge-conflict state as a dashboard row",
  dashboardSections: [SECTION_ID],
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_REOPENED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
  },
};
