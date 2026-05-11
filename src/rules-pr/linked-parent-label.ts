import type { PullRequestEditedEvent, PullRequestOpenedEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";
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
  return {
    name: "linked-parent-label",
    description: `Labels PRs with '${label}' when their body links to a ${describe}`,
    listens: [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_EDITED],

    async handle(context: WebhookContext): Promise<RuleResult | undefined> {
      const payload = context.payload as PullRequestOpenedEvent | PullRequestEditedEvent;
      const hasParent = extractAllLinks(payload.pull_request.body).some(config.isParent);
      if (!hasParent) return;
      return { labels: [label] };
    },
  };
}
