import { EventType } from "../engine/event.js";
import { on } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";
import { fetchIntegrationManifest } from "../util/integration.js";
import { extractIntegrationDocumentationLinks } from "../util/pr-body.js";
import { MAX_INTEGRATION_LABELS } from "./integration-domain.js";

type HandledEvent = EventType.ISSUES_OPENED | EventType.ISSUES_ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  const links = extractIntegrationDocumentationLinks(await ctx.target.body());
  // Platform-page links (`/integrations/binary_sensor.template`) name the
  // integration in the platform segment; plain pages in the integration one.
  const candidates = [...new Set(links.map((l) => l.platform ?? l.integration))].slice(
    0,
    MAX_INTEGRATION_LABELS,
  );

  // Only label real integrations — a manifest fetch doubles as validation, so
  // typos and custom-integration links don't create junk labels.
  const domains: string[] = [];
  for (const domain of candidates) {
    if (await fetchIntegrationManifest(domain)) domains.push(domain);
  }
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
