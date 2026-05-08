import type { PullRequestOpenedEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";
import { extractForumLinks } from "../utils/text-parser.js";

const WTH_CATEGORY_IDS = [56, 61];

export const prLabelWth: Rule = {
  name: "pr-label-wth",
  description: "Labels PRs that link to 'What the Heck' forum posts",
  listens: [EventType.PULL_REQUEST_OPENED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as PullRequestOpenedEvent;

    for (const link of extractForumLinks(payload.pull_request.body)) {
      try {
        const res = await fetch(`${link}.json`);
        if (!res.ok) continue;
        const data = (await res.json()) as { category_id?: number };
        if (data.category_id && WTH_CATEGORY_IDS.includes(data.category_id)) {
          return { labels: ["WTH"] };
        }
      } catch {
        // Bad link
      }
    }
  },
};
