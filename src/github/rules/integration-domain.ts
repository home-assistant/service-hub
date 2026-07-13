import { EventType } from "../engine/event.js";
import { on } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";
import { MAX_INTEGRATION_LABELS } from "./integrations.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  const domains = await ctx.target.integrationDomains();
  if (domains.length === 0 || domains.length > MAX_INTEGRATION_LABELS) {
    return undefined;
  }

  return [{ type: "addLabels", labels: domains.map((d) => `integration: ${d}`) }];
}

export const integrationDomain: Rule = {
  name: "integration-domain",
  description: "Labels PRs touching integration code with `integration: <domain>` labels.",
  events: on(
    [
      EventType.PULL_REQUEST_OPENED,
      EventType.PULL_REQUEST_EDITED,
      EventType.PULL_REQUEST_SYNCHRONIZE,
      EventType.ON_DEMAND,
    ],
    evaluate,
  ),
};
