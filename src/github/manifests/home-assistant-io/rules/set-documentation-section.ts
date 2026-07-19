import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Effect, Rule } from "../../../engine/types.js";
import { extractDocumentationSectionsLinks } from "../../../helpers/ha-links.js";

type HandledEvent = EventType.ISSUES_OPENED | EventType.ISSUES_ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  const sections = extractDocumentationSectionsLinks(await ctx.target.body());

  // Integration feedback is handled by the integration rules, not sections.
  if (sections.includes("integrations")) return;

  // URL path segments are mostly noise ("docs", "blog", locale codes, …) —
  // only segments the repo curates a label for count, and addLabels would
  // otherwise create the rest.
  const labels: string[] = [];
  for (const section of sections) {
    try {
      await ctx.github.issues.getLabel(ctx.repoParams({ name: section }));
      labels.push(section);
    } catch {
      // 404 — no such label.
    }
  }

  if (labels.length === 0) return;
  return [{ type: "addLabels", labels }];
}

export const setDocumentationSection: Rule = {
  name: "set-documentation-section",
  description:
    "Labels docs issues with the documentation sections their body links to, for " +
    "sections that exist as repo labels.",
  allowBots: false,
  events: on([EventType.ISSUES_OPENED, EventType.ISSUES_ON_DEMAND], evaluate),
};
