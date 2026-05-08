import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository, type Repository } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";

const branchLabels: Partial<Record<Repository, Set<string>>> = {
  [HomeAssistantRepository.HOME_ASSISTANT_IO]: new Set(["current", "rc", "next"]),
};

export const docsPrBranchLabel: Rule = {
  name: "docs-pr-branch-label",
  allowBots: false,
  listens: [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_EDITED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const validLabels = branchLabels[context.repository];
    if (!validLabels) return;

    const payload = context.payload as unknown as {
      pull_request: { base: { ref: string }; labels: { name: string }[] };
    };
    const targetBranch = payload.pull_request.base.ref;
    const currentLabels = payload.pull_request.labels.map((l) => l.name);

    const result: RuleResult = {};

    if (validLabels.has(targetBranch) && !currentLabels.includes(targetBranch)) {
      result.labels = [targetBranch];
    }

    const toRemove = currentLabels.filter((l) => validLabels.has(l) && l !== targetBranch);
    if (toRemove.length > 0) {
      result.removeLabels = toRemove;
    }

    if (result.labels || result.removeLabels) return result;
  },
};
