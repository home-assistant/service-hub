import { z } from "zod";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";
import { EventType } from "../github/types.js";
import { fetchWithTimeout } from "../util/fetch.js";
import { extractForumLinks } from "../util/pr-body.js";

const WTH_CATEGORY_IDS = [56, 61];

const ForumPostSchema = z.object({ category_id: z.number().optional() });

type HandledEvent = EventType.PULL_REQUEST_OPENED | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  for (const link of extractForumLinks(await ctx.target.body())) {
    try {
      const res = await fetchWithTimeout(`${link}.json`);
      if (!res.ok) continue;
      const parsed = ForumPostSchema.safeParse(await res.json());
      if (!parsed.success) {
        console.warn(`wth: schema mismatch on ${link}:`, parsed.error.issues);
        continue;
      }
      const categoryId = parsed.data.category_id;
      if (categoryId && WTH_CATEGORY_IDS.includes(categoryId)) {
        return [{ type: "addLabels", labels: ["WTH"] }];
      }
    } catch (err) {
      console.warn(`wth: fetch ${link}.json failed:`, err);
    }
  }
}

export const wth: Rule = {
  name: "wth",
  description: "Labels PRs that link to 'What the Heck' forum posts",
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
