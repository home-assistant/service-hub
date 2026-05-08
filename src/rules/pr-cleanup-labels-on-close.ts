import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository, type Repository } from "../github/types.js";
import type { Rule, RuleResult } from "./types.js";

const labelsToClean: Partial<Record<Repository, string[]>> = {
  [HomeAssistantRepository.CORE]: ["Ready for review"],
  [HomeAssistantRepository.HOME_ASSISTANT_IO]: [
    "needs-rebase",
    "in-progress",
    "awaits-parent",
    "ready-for-review",
    "parent-merged",
  ],
};

export const prCleanupLabelsOnClose: Rule = {
  name: "label-cleaner",
  listens: [EventType.PULL_REQUEST_CLOSED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const cleanLabels = labelsToClean[context.repository];
    if (!cleanLabels) return;

    const payload = context.payload as unknown as {
      pull_request: { labels: { name: string }[] };
    };
    const currentLabels = new Set(payload.pull_request.labels.map((l) => l.name));
    const toRemove = cleanLabels.filter((label) => currentLabels.has(label));

    if (toRemove.length === 0) return;

    return { removeLabels: toRemove };
  },
};
