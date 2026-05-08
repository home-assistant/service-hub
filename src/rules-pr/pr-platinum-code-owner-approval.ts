import type { PullRequestLabeledEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";
import { fetchIntegrationManifest, QualityScale } from "../utils/integration.js";
import { expandOrganizationTeams } from "../utils/organization-teams.js";

export const prPlatinumCodeOwnerApproval: Rule = {
  name: "pr-platinum-code-owner-approval",
  listens: [
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.PULL_REQUEST_UNLABELED,
  ],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as PullRequestLabeledEvent;

    const currentLabels = payload.pull_request.labels.map((l) => l.name);
    const integrations = currentLabels.filter((l) => l.startsWith("integration: "));

    let requiresApproval =
      currentLabels.includes(`Quality Scale: ${QualityScale.PLATINUM}`) &&
      integrations.length === 1 &&
      !currentLabels.some((l) => ["by-code-owner", "code-owner-approved"].includes(l));

    if (requiresApproval) {
      const domain = integrations[0].substring(13);
      const manifest = await fetchIntegrationManifest(domain);

      if (!manifest?.codeowners?.length) {
        requiresApproval = false;
      } else {
        const reviews = await context.github.pulls.listReviews(
          context.pullRequest({ per_page: 100 }),
        );
        const expandedOwners = await expandOrganizationTeams(
          context.github,
          context.organization,
          manifest.codeowners,
        );

        if (
          reviews.data.some(
            (r) =>
              r.state === "APPROVED" && expandedOwners.includes(r.user?.login?.toLowerCase() ?? ""),
          )
        ) {
          requiresApproval = false;
          return {
            labels: ["code-owner-approved"],
            statusCheck: {
              context: "code-owner-approval",
              state: "success",
              description: "Code owner approval ok.",
            },
          };
        }
      }
    }

    return {
      statusCheck: {
        context: "code-owner-approval",
        state: requiresApproval ? "failure" : "success",
        description: requiresApproval
          ? "Code owner approval required for Platinum integrations before merging"
          : "Code owner approval ok.",
      },
    };
  },
};
