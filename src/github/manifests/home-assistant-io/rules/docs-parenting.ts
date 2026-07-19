import { slugOf } from "../../../../util/item-ref.js";
import { extractAllLinks } from "../../../../util/pr-body.js";
import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Effect, Rule } from "../../../engine/types.js";
import { HomeAssistantRepository } from "../../home-assistant-org.js";
import { Organization } from "../../types.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.ON_DEMAND;

/**
 * The docs half of docs-parenting: the code repos' rule labels the linked
 * docs PR cross-repo and syncs open/closed state onto it; this one only marks
 * the docs PR itself as having a parent when its own body names one.
 */
async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  const linksToParents = extractAllLinks(await ctx.target.body()).filter(
    (link) =>
      link.owner === Organization.HOME_ASSISTANT &&
      slugOf(link) !== HomeAssistantRepository.HOME_ASSISTANT_IO,
  );
  if (linksToParents.length === 0) return;

  return [{ type: "addLabels", labels: ["has-parent"] }];
}

export const docsParenting: Rule = {
  name: "docs-parenting",
  description: "Labels docs PRs whose body links a parent PR on a code repo with `has-parent`.",
  events: on(
    [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_EDITED, EventType.ON_DEMAND],
    evaluate,
  ),
};
