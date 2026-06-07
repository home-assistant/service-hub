import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_CLOSED
  | EventType.ON_DEMAND;

function inOctober(): boolean {
  return new Date().getMonth() === 9;
}

function isHacktoberfestRepo(topics: string[] | undefined): boolean {
  return topics?.includes("hacktoberfest") ?? false;
}

async function evaluate(
  ctx: WebhookContext<EventPayloadMap[HandledEvent]>,
): Promise<Effect[] | undefined> {
  const pr = ctx.payload.pull_request;
  const prAny = pr as {
    state?: string;
    merged?: boolean | null;
    merged_at?: string | null;
  };
  const repoTopics = ctx.payload.repository.topics;
  const hasHacktoberfestLabel = pr.labels.some((l) => l.name === "Hacktoberfest");
  const isClosed = ctx.eventType === EventType.PULL_REQUEST_CLOSED || prAny.state === "closed";
  const isMerged = prAny.merged === true || prAny.merged_at != null;

  // On a closed-but-not-merged PR, strip the label if it's still there.
  if (isClosed && !isMerged && hasHacktoberfestLabel) {
    return [{ type: "removeLabels", label: ["Hacktoberfest"] }];
  }

  // On an open PR during October on a participating repo, label it.
  if (!isClosed && !ctx.senderIsBot && inOctober() && isHacktoberfestRepo(repoTopics)) {
    return [{ type: "addLabels", labels: ["Hacktoberfest"] }];
  }
}

export const prHacktoberfest: Rule = {
  name: "pr-hacktoberfest",
  description: "Labels PRs with 'Hacktoberfest' during October on participating repos",
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_CLOSED]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
