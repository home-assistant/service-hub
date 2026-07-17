import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Effect, Rule } from "../../../engine/types.js";
import { domainsFromIssueBody } from "../helpers/integration-domains.js";

type HandledEvent = EventType.ISSUES_OPENED | EventType.ISSUES_ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  const domains = await domainsFromIssueBody(await ctx.target.body());
  if (domains.length === 0) return;

  return [{ type: "addLabels", labels: domains.map((d) => `integration: ${d}`) }];
}

export const setIntegration: Rule = {
  name: "set-integration",
  description:
    "Labels issues with `integration: <domain>` based on the integration documentation " +
    "links in the issue body.",
  allowBots: false,
  events: on([EventType.ISSUES_OPENED, EventType.ISSUES_ON_DEMAND], evaluate),
};
