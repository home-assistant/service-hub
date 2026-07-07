import { fetchIntegrationManifest, QualityScale } from "../../util/integration.js";
import { EventType } from "../engine/event.js";
import { type CheckOutcome, check } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";

type HandledEvent =
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_REVIEW_SUBMITTED
  | EventType.PULL_REQUEST_REVIEW_DISMISSED
  | EventType.ON_DEMAND;

const APPROVED_LABEL = "code-owner-approved";

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome> {
  const currentLabels = await ctx.target.labels();
  const integrations = currentLabels.filter((l) => l.startsWith("integration: "));

  const isPlatinum = currentLabels.includes(`Quality Scale: ${QualityScale.PLATINUM}`);

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
  if (currentLabels.includes("by-code-owner")) {
    return { status: "pass", message: "Authored by a code owner." };
  }

  const domain = integrations[0].substring(13);
  const manifest = await fetchIntegrationManifest(domain);
  if (!manifest?.codeowners?.length) {
    return { status: "skip", message: `Integration \`${domain}\` has no code owners listed.` };
  }

  // The approval label is never trusted on its own — an approval can be
  // dismissed, so the reviews are the source of truth and the label follows.
  const reviews = await ctx.target.reviews();
  const expandedOwners = await ctx.org.expandTeams(manifest.codeowners);
  const approvedByOwner = reviews.some(
    (r) => r.state === "APPROVED" && expandedOwners.includes(r.user?.login?.toLowerCase() ?? ""),
  );

  if (approvedByOwner) {
    return {
      status: "pass",
      message: "Approved by a code owner.",
      effects: [{ type: "addLabels", labels: [APPROVED_LABEL] }],
    };
  }

  // Reviewer-actionable, not author-actionable: `pending` blocks the merge
  // without drafting the PR, which would hide it from the review queue and
  // make the approval it's waiting for impossible.
  return {
    status: "pending",
    message: "Platinum integration — needs approval from a code owner before merging.",
    ...(currentLabels.includes(APPROVED_LABEL)
      ? { effects: [{ type: "removeLabels", labels: [APPROVED_LABEL] }] }
      : {}),
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
    EventType.PULL_REQUEST_REVIEW_DISMISSED,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
