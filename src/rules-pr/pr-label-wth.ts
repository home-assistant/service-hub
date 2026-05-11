import { z } from "zod";
import { EventType } from "../github/types.js";
import type { Rule } from "../rules/types.js";
import { fetchWithTimeout } from "../utils/fetch.js";
import { extractForumLinks } from "../utils/text-parser.js";

const WTH_CATEGORY_IDS = [56, 61];

const ForumPostSchema = z.object({ category_id: z.number().optional() });

export const prLabelWth: Rule = {
  name: "pr-label-wth",
  description: "Labels PRs that link to 'What the Heck' forum posts",
  events: {
    [EventType.PULL_REQUEST_OPENED]: async (ctx) => {
      for (const link of extractForumLinks(ctx.payload.pull_request.body)) {
        try {
          const res = await fetchWithTimeout(`${link}.json`);
          if (!res.ok) continue;
          const parsed = ForumPostSchema.safeParse(await res.json());
          if (!parsed.success) {
            console.warn(`prLabelWth: schema mismatch on ${link}:`, parsed.error.issues);
            continue;
          }
          const categoryId = parsed.data.category_id;
          if (categoryId && WTH_CATEGORY_IDS.includes(categoryId)) {
            return [{ type: "addLabels", labels: ["WTH"] }];
          }
        } catch (err) {
          console.warn(`prLabelWth: fetch ${link}.json failed:`, err);
        }
      }
    },
  },
};
