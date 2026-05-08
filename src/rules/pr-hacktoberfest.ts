import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "./types.js";

export const prHacktoberfest: Rule = {
  name: "pr-hacktoberfest",
  listens: [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_CLOSED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as unknown as {
      action: string;
      pull_request: {
        merged: boolean;
        labels: { name: string }[];
      };
      repository: { topics?: string[] };
    };

    if (context.eventType === EventType.PULL_REQUEST_OPENED) {
      if (context.senderIsBot) return;
      if (new Date().getMonth() !== 9) return; // October = 9
      if (!payload.repository.topics?.includes("hacktoberfest")) return;
      return { labels: ["Hacktoberfest"] };
    }

    // PR closed without merge — remove Hacktoberfest label
    if (context.eventType === EventType.PULL_REQUEST_CLOSED) {
      if (payload.pull_request.merged) return;
      if (!payload.pull_request.labels.some((l) => l.name === "Hacktoberfest")) return;
      return { removeLabels: ["Hacktoberfest"] };
    }
  },
};
