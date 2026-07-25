import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Effect, Rule } from "../engine/types.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_CLOSED
  | EventType.ON_DEMAND;

function inOctober(): boolean {
  return new Date().getMonth() === 9;
}

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  const hasHacktoberfestLabel = (await ctx.target.labels()).includes("Hacktoberfest");
  const isClosed =
    ctx.eventType === EventType.PULL_REQUEST_CLOSED || (await ctx.target.state()) === "closed";
  const isMerged =
    (ctx.event.type === EventType.PULL_REQUEST_CLOSED && ctx.event.merged) ||
    (await ctx.target.mergedAt()) != null;

  // On a closed-but-not-merged PR, strip the label if it's still there.
  if (isClosed && !isMerged && hasHacktoberfestLabel) {
    return [{ type: "removeLabels", labels: ["Hacktoberfest"] }];
  }

  // On an open PR during October on a participating repo, label it.
  if (!isClosed && !ctx.senderIsBot && inOctober() && ctx.repo.topics.includes("hacktoberfest")) {
    return [{ type: "addLabels", labels: ["Hacktoberfest"] }];
  }
}

export const hacktoberfest: Rule = {
  name: "hacktoberfest",
  description: "Labels PRs with 'Hacktoberfest' during October on participating repos",
  events: on(
    [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_CLOSED, EventType.ON_DEMAND],
    evaluate,
  ),
};
