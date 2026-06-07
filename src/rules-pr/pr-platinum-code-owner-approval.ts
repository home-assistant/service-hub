import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";
import { fetchIntegrationManifest, QualityScale } from "../utils/integration.js";
import { expandOrganizationTeams } from "../utils/organization-teams.js";

type HandledEvent =
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_REVIEW_SUBMITTED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.ON_DEMAND;

async function evaluate(
  ctx: WebhookContext<EventPayloadMap[HandledEvent]>,
): Promise<Effect[] | undefined> {
  const currentLabels = ctx.payload.pull_request.labels.map((l) => l.name);
  const integrations = currentLabels.filter((l) => l.startsWith("integration: "));

  const isPlatinum = currentLabels.includes(`Quality Scale: ${QualityScale.PLATINUM}`);
  const alreadyApproved = currentLabels.some((l) =>
    ["by-code-owner", "code-owner-approved"].includes(l),
  );

  // Skip when this PR doesn't require code-owner approval at all.
  if (!isPlatinum) {
    return [
      {
        type: "dashboardSection",
        section: {
          id: "code-owner-approval",
          title: "Code owner approval",
          status: "skip",
          message: "Not a platinum integration — no code-owner approval required.",
        },
      },
    ];
  }
  if (integrations.length !== 1) {
    return [
      {
        type: "dashboardSection",
        section: {
          id: "code-owner-approval",
          title: "Code owner approval",
          status: "skip",
          message: "Touches zero or multiple integrations — code-owner approval not enforced.",
        },
      },
    ];
  }
  if (alreadyApproved) {
    return [
      {
        type: "dashboardSection",
        section: {
          id: "code-owner-approval",
          title: "Code owner approval",
          status: "pass",
          message: "Approved by a code owner.",
        },
      },
    ];
  }

  const domain = integrations[0].substring(13);
  const manifest = await fetchIntegrationManifest(domain);
  if (!manifest?.codeowners?.length) {
    return [
      {
        type: "dashboardSection",
        section: {
          id: "code-owner-approval",
          title: "Code owner approval",
          status: "skip",
          message: `Integration \`${domain}\` has no code owners listed.`,
        },
      },
    ];
  }

  const reviews = await ctx.github.pulls.listReviews(ctx.pullRequest({ per_page: 100 }));
  const expandedOwners = await expandOrganizationTeams(
    ctx.github,
    ctx.organization,
    manifest.codeowners,
  );
  const approvedByOwner = reviews.data.some(
    (r) => r.state === "APPROVED" && expandedOwners.includes(r.user?.login?.toLowerCase() ?? ""),
  );

  if (approvedByOwner) {
    return [
      { type: "addLabels", labels: ["code-owner-approved"] },
      {
        type: "dashboardSection",
        section: {
          id: "code-owner-approval",
          title: "Code owner approval",
          status: "pass",
          message: "Approved by a code owner.",
        },
      },
    ];
  }

  return [
    {
      type: "dashboardSection",
      section: {
        id: "code-owner-approval",
        title: "Code owner approval",
        status: "fail",
        message: "Platinum integration — needs approval from a code owner before merging.",
      },
    },
  ];
}

export const prPlatinumCodeOwnerApproval: Rule = {
  name: "pr-platinum-code-owner-approval",
  description: "Requires code owner approval for platinum quality scale integrations",
  dashboardSections: ["code-owner-approval"],
  events: {
    [EventType.PULL_REQUEST_LABELED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_OPENED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_REOPENED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_REVIEW_SUBMITTED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_SYNCHRONIZE]: async (ctx) => evaluate(ctx),
    [EventType.ON_DEMAND]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_UNLABELED]: async (ctx) => evaluate(ctx),
  },
};
