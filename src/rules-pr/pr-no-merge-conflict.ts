import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";

async function evaluate(
  ctx: WebhookContext<
    | EventPayloadMap[EventType.PULL_REQUEST_OPENED]
    | EventPayloadMap[EventType.PULL_REQUEST_SYNCHRONIZE]
  >,
): Promise<Effect[] | undefined> {
  const { data: pr } = await ctx.github.pulls.get(ctx.pullRequest());

  if (pr.mergeable_state === "unknown") return; // GitHub hasn't computed yet
  if (pr.mergeable_state !== "dirty") return;

  return [{ type: "requestChanges", body: "There is a merge conflict." }];
}

export const prNoMergeConflict: Rule = {
  name: "pr-no-merge-conflict",
  description: "Requests changes when a PR has merge conflicts",
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
  },
};
