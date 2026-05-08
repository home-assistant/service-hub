import type { PullRequestLabeledEvent, PullRequestUnlabeledEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";

export function blockingLabels(
  config: Record<string, { message: string; success?: string }>,
): Rule {
  return {
    name: "blocking-labels",
    description: `Blocks PRs with labels: ${Object.keys(config).join(", ")}`,
    listens: [
      EventType.PULL_REQUEST_LABELED,
      EventType.PULL_REQUEST_UNLABELED,
      EventType.PULL_REQUEST_SYNCHRONIZE,
    ],

    async handle(context: WebhookContext): Promise<RuleResult | undefined> {
      const payload = context.payload as PullRequestLabeledEvent | PullRequestUnlabeledEvent;
      const currentLabels = new Set(payload.pull_request.labels.map((l) => l.name));

      const actions: Array<(ctx: WebhookContext) => Promise<void>> = [];

      for (const [label, description] of Object.entries(config)) {
        const hasBlockingLabel = currentLabels.has(label);
        const contextName = `blocking-label-${label.toLowerCase().replaceAll(" ", "-")}`;

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
}
