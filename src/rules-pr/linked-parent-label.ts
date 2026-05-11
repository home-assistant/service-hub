import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";
import { extractAllLinks } from "../utils/text-parser.js";

export interface LinkedParentLabelConfig {
  /**
   * Predicate identifying "parent" links. A PR whose body references an
   * issue/PR matching this predicate gets the configured label.
   */
  isParent: (link: { owner: string; repo: string; number: number }) => boolean;
  /** Label to apply when a parent link is found. Defaults to `has-parent`. */
  label?: string;
  /** Display description suffix for the rule. */
  describe?: string;
}

export function linkedParentLabel(config: LinkedParentLabelConfig): Rule {
  const label = config.label ?? "has-parent";
  const describe = config.describe ?? "linked PR/issue";

  function evaluate(
    ctx: WebhookContext<
      | EventPayloadMap[EventType.PULL_REQUEST_OPENED]
      | EventPayloadMap[EventType.PULL_REQUEST_EDITED]
    >,
  ): Effect[] | undefined {
    const hasParent = extractAllLinks(ctx.payload.pull_request.body).some(config.isParent);
    if (!hasParent) return;
    return [{ type: "addLabels", labels: [label] }];
  }

  return {
    name: "linked-parent-label",
    description: `Labels PRs with '${label}' when their body links to a ${describe}`,
    events: {
      [EventType.PULL_REQUEST_OPENED]: async (ctx) => evaluate(ctx),
      [EventType.PULL_REQUEST_EDITED]: async (ctx) => evaluate(ctx),
    },
  };
}
