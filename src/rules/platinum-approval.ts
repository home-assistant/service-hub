import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";
import { fetchIntegrationManifest, QualityScale } from "../util/integration.js";

type HandledEvent =
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_REVIEW_SUBMITTED
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  const currentLabels = await ctx.target.labels();
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

  const reviews = await ctx.target.reviews();
  const expandedOwners = await ctx.org.expandTeams(manifest.codeowners);
  const approvedByOwner = reviews.some(
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

export const platinumApproval: Rule = {
  name: "code-owner-approval",
  description: "Requires code owner approval for platinum quality scale integrations",
  dashboardSections: ["code-owner-approval"],
  events: {
    [EventType.PULL_REQUEST_LABELED]: evaluate,
    [EventType.PULL_REQUEST_UNLABELED]: evaluate,
    [EventType.PULL_REQUEST_REVIEW_SUBMITTED]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
