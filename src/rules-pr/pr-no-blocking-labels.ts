import type { PullRequestLabeledEvent, PullRequestUnlabeledEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository, type Repository } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";

const labelsToCheck: Partial<
  Record<Repository, Record<string, { message: string; success?: string }>>
> = {
  [HomeAssistantRepository.CORE]: {
    "awaiting-frontend": { message: "This PR is awaiting changes to the frontend" },
  },
  [HomeAssistantRepository.FRONTEND]: {
    "wait for backend": { message: "This PR is awaiting changes to the backend" },
  },
};

export const prNoBlockingLabels: Rule = {
  name: "blocking-labels",
  listens: [
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
  ],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as unknown as
      | PullRequestLabeledEvent
      | PullRequestUnlabeledEvent;
    const currentLabels = new Set(
      payload.pull_request.labels.map((label: { name: string }) => label.name),
    );
    const checks = labelsToCheck[context.repository];
    if (!checks) return;

    const actions: Array<(ctx: WebhookContext) => Promise<void>> = [];

    for (const [label, description] of Object.entries(checks)) {
      const hasBlockingLabel = currentLabels.has(label);
      const contextName = `blocking-label-${label.toLowerCase().replace(" ", "-")}`;

      actions.push(async (ctx) => {
        await ctx.github.repos.createCommitStatus(
          ctx.repo({
            sha: payload.pull_request.head.sha,
            context: contextName,
            state: hasBlockingLabel ? ("failure" as const) : ("success" as const),
            description: hasBlockingLabel ? description.message : (description.success ?? "OK"),
          }),
        );
      });
    }

    return { actions };
  },
};
