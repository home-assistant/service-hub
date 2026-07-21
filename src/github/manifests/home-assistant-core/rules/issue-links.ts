import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Effect, Rule } from "../../../engine/types.js";
import { INTEGRATION_LABEL_PREFIX } from "../../../helpers/integration-domains.js";
import { itemIntegrationDomains } from "../helpers/integration-domains.js";

type HandledEvent = EventType.ISSUES_OPENED | EventType.ISSUES_LABELED | EventType.ISSUES_ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  if ("label" in ctx.event && !ctx.event.label.startsWith(INTEGRATION_LABEL_PREFIX)) return;
  // Plain rule (blocks, not check()): guard closed issues itself.
  if ((await ctx.target.state()) !== "open") return;

  const domains = await itemIntegrationDomains(ctx);

  return [
    {
      type: "updateBlock",
      block: "integration-links",
      args:
        domains.length === 0
          ? null
          : {
              domains: domains.map((d) => ({
                domain: d,
                docs: `https://www.home-assistant.io/integrations/${d}`,
                source: `https://github.com/${ctx.repo.fullName}/tree/dev/homeassistant/components/${d}`,
                issues: `https://github.com/${ctx.repo.fullName}/issues?q=label%3A%22integration%3A%20${encodeURIComponent(d)}%22`,
              })),
            },
    },
  ];
}

export const issueLinks: Rule = {
  name: "issue-links",
  description: "Shows documentation, source, and issue-search links for labeled integrations",
  events: on(
    [EventType.ISSUES_OPENED, EventType.ISSUES_LABELED, EventType.ISSUES_ON_DEMAND],
    evaluate,
  ),
};
