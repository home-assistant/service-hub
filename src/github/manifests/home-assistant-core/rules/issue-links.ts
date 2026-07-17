import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import {
  INTEGRATION_LABEL_PREFIX,
  itemIntegrationDomains,
} from "../helpers/integration-domains.js";

type HandledEvent = EventType.ISSUES_OPENED | EventType.ISSUES_LABELED | EventType.ISSUES_ON_DEMAND;

async function evaluate(
  ctx: RuleContext<HandledEvent>,
): Promise<CheckOutcome | "clear" | undefined> {
  if ("label" in ctx.event && !ctx.event.label.startsWith(INTEGRATION_LABEL_PREFIX)) return;

  const domains = await itemIntegrationDomains(ctx);
  if (domains.length === 0) return "clear";

  const lines = domains.map(
    (d) =>
      `- \`${d}\`: [documentation](https://www.home-assistant.io/integrations/${d}) · ` +
      `[source](https://github.com/${ctx.repo.fullName}/tree/dev/homeassistant/components/${d}) · ` +
      `[known issues](https://github.com/${ctx.repo.fullName}/issues?q=label%3A%22integration%3A%20${encodeURIComponent(d)}%22)`,
  );
  return { status: "info", message: lines.join("\n") };
}

export const issueLinks = check({
  id: "integration-links",
  title: "Integration links",
  description: "Adds documentation, source, and issue-search links for labeled integrations",
  events: [EventType.ISSUES_OPENED, EventType.ISSUES_LABELED, EventType.ISSUES_ON_DEMAND],
  evaluate,
});
