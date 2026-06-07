import { EventType } from "../github/types.js";
import type { Effect, Rule } from "../rules/types.js";

export const prHacktoberfest: Rule = {
  name: "pr-hacktoberfest",
  description: "Labels PRs with 'Hacktoberfest' during October on participating repos",
  events: {
    [EventType.PULL_REQUEST_OPENED]: async (ctx): Promise<Effect[] | undefined> => {
      if (ctx.senderIsBot) return;
      if (new Date().getMonth() !== 9) return; // October = 9
      if (!ctx.payload.repository.topics?.includes("hacktoberfest")) return;
      return [{ type: "addLabels", labels: ["Hacktoberfest"] }];
    },

    [EventType.PULL_REQUEST_CLOSED]: async (ctx): Promise<Effect[] | undefined> => {
      if (ctx.payload.pull_request.merged) return;
      if (!ctx.payload.pull_request.labels.some((l) => l.name === "Hacktoberfest")) return;
      return [{ type: "removeLabels", label: ["Hacktoberfest"] }];
    },
  },
};
