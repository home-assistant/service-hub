import { EventType } from "../engine/event.js";
import { type CheckOutcome, check } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";
import { fetchIntegrationManifest, QualityScale } from "../util/integration.js";

type HandledEvent =
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_REVIEW_SUBMITTED
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome> {
  const currentLabels = await ctx.target.labels();
  const integrations = currentLabels.filter((l) => l.startsWith("integration: "));

  const isPlatinum = currentLabels.includes(`Quality Scale: ${QualityScale.PLATINUM}`);
  const alreadyApproved = currentLabels.some((l) =>
    ["by-code-owner", "code-owner-approved"].includes(l),
  );

  // Skip when this PR doesn't require code-owner approval at all.
  if (!isPlatinum) {
    return {
      status: "skip",
      message: "Not a platinum integration — no code-owner approval required.",
    };
  }
  if (integrations.length !== 1) {
    return {
      status: "skip",
      message: "Touches zero or multiple integrations — code-owner approval not enforced.",
    };
  }
  if (alreadyApproved) {
    return { status: "pass", message: "Approved by a code owner." };
  }

  const domain = integrations[0].substring(13);
  const manifest = await fetchIntegrationManifest(domain);
  if (!manifest?.codeowners?.length) {
    return { status: "skip", message: `Integration \`${domain}\` has no code owners listed.` };
  }

  const reviews = await ctx.target.reviews();
  const expandedOwners = await ctx.org.expandTeams(manifest.codeowners);
  const approvedByOwner = reviews.some(
    (r) => r.state === "APPROVED" && expandedOwners.includes(r.user?.login?.toLowerCase() ?? ""),
  );

  if (approvedByOwner) {
    return {
      status: "pass",
      message: "Approved by a code owner.",
      effects: [{ type: "addLabels", labels: ["code-owner-approved"] }],
    };
  }

  return {
    status: "fail",
    message: "Platinum integration — needs approval from a code owner before merging.",
  };
}

export const platinumApproval = check({
  id: "code-owner-approval",
  title: "Code owner approval",
  description: "Requires code owner approval for platinum quality scale integrations",
  events: [
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
