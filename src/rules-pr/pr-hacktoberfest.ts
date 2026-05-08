import type { PullRequestClosedEvent, PullRequestOpenedEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";

export const prHacktoberfest: Rule = {
  name: "pr-hacktoberfest",
  listens: [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_CLOSED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    if (context.eventType === EventType.PULL_REQUEST_OPENED) {
      if (context.senderIsBot) return;
      if (new Date().getMonth() !== 9) return; // October = 9
      const payload = context.payload as PullRequestOpenedEvent;
      if (!payload.repository.topics?.includes("hacktoberfest")) return;
      return { labels: ["Hacktoberfest"] };
    }

    // PR closed without merge — remove Hacktoberfest label
    if (context.eventType === EventType.PULL_REQUEST_CLOSED) {
      const payload = context.payload as PullRequestClosedEvent;
      if (payload.pull_request.merged) return;
      if (!payload.pull_request.labels.some((l) => l.name === "Hacktoberfest")) return;
      return { removeLabels: ["Hacktoberfest"] };
    }
  },
};
