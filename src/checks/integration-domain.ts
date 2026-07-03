import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";

/**
 * Cap on how many `integration: <domain>` labels a single PR gets. A PR
 * touching more than this many integrations is almost always a tree-wide
 * change, where per-integration labels are noise. Shared with
 * `integration-top-rank` so the two stay in lockstep.
 */
export const MAX_INTEGRATION_LABELS = 5;

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  if (ctx.senderIsBot) return undefined;

  const domains = await ctx.target.integrationDomains();
  if (domains.length === 0 || domains.length > MAX_INTEGRATION_LABELS) {
    return undefined;
  }

  return [{ type: "addLabels", labels: domains.map((d) => `integration: ${d}`) }];
}

export const integrationDomain: Rule = {
  name: "integration-domain",
  description: "Labels PRs touching integration code with `integration: <domain>` labels.",
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_EDITED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
