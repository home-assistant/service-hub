import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";
import { fetchIntegrationManifest, QualityScale } from "../utils/integration.js";
import { expandOrganizationTeams } from "../utils/organization-teams.js";

type PlatinumEvent =
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_REVIEW_SUBMITTED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_UNLABELED;

async function evaluate(
  ctx: WebhookContext<EventPayloadMap[PlatinumEvent]>,
): Promise<Effect[] | undefined> {
  const currentLabels = ctx.payload.pull_request.labels.map((l) => l.name);
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
      const reviews = await ctx.github.pulls.listReviews(ctx.pullRequest({ per_page: 100 }));
      const expandedOwners = await expandOrganizationTeams(
        ctx.github,
        ctx.organization,
        manifest.codeowners,
      );

      if (
        reviews.data.some(
          (r) =>
            r.state === "APPROVED" && expandedOwners.includes(r.user?.login?.toLowerCase() ?? ""),
        )
      ) {
        return [
          { type: "addLabels", labels: ["code-owner-approved"] },
          {
            type: "statusCheck",
            sha: ctx.payload.pull_request.head.sha,
            context: "code-owner-approval",
            state: "success",
            description: "Code owner approval ok.",
          },
        ];
      }
    }
  }

  return [
    {
      type: "statusCheck",
      sha: ctx.payload.pull_request.head.sha,
      context: "code-owner-approval",
      state: requiresApproval ? "failure" : "success",
      description: requiresApproval
        ? "Code owner approval required for Platinum integrations before merging"
        : "Code owner approval ok.",
    },
  ];
}

export const prPlatinumCodeOwnerApproval: Rule = {
  name: "pr-platinum-code-owner-approval",
  description: "Requires code owner approval for platinum quality scale integrations",
  events: {
    [EventType.PULL_REQUEST_LABELED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_OPENED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_REOPENED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_REVIEW_SUBMITTED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_SYNCHRONIZE]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_UNLABELED]: async (ctx) => evaluate(ctx),
  },
};
