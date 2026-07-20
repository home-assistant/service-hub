import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { INTEGRATION_LABEL_PREFIX } from "../../../helpers/integration-domains.js";
import { fetchIntegrationManifest, QualityScale } from "../../../helpers/integration-manifest.js";
import { itemIntegrationDomains } from "../helpers/integration-domains.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_REVIEW_SUBMITTED
  | EventType.PULL_REQUEST_REVIEW_DISMISSED
  | EventType.ON_DEMAND;

const APPROVED_LABEL = "code-owner-approved";

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  // Only integration labels change what this check concludes.
  if ("label" in ctx.event && !ctx.event.label.startsWith(INTEGRATION_LABEL_PREFIX)) return;

  // Everything is derived from the PR itself (files, manifest, CODEOWNERS
  // teams, reviews) — never from labels other rules maintain.
  const domains = await itemIntegrationDomains(ctx);
  if (domains.length !== 1) {
    return {
      status: "skip",
      message: "Touches zero or multiple integrations — code-owner approval not enforced.",
    };
  }

  const domain = domains[0];
  const manifest = await fetchIntegrationManifest(domain);
  if (manifest?.quality_scale !== QualityScale.PLATINUM) {
    return {
      status: "skip",
      message: "Not a platinum integration — no code-owner approval required.",
    };
  }
  if (!manifest.codeowners?.length) {
    return { status: "skip", message: `Integration \`${domain}\` has no code owners listed.` };
  }

  const expandedOwners = await ctx.expandTeams(manifest.codeowners);
  const authorLogin = (await ctx.target.authorLogin()).toLowerCase();
  if (expandedOwners.includes(authorLogin)) {
    return { status: "pass", message: "Authored by a code owner." };
  }

  // The approval label is never trusted on its own — an approval can be
  // dismissed or superseded, so the reviews are the source of truth and the
  // label follows. Only an owner's *latest* decisive review counts: an old
  // APPROVED is void once the same owner later requests changes or has the
  // approval dismissed. Reviews come back oldest-first, so the last write per
  // owner wins; COMMENTED/PENDING reviews don't change a standing decision.
  const reviews = await ctx.target.reviews();
  const latestByOwner = new Map<string, string>();
  for (const r of reviews) {
    const login = r.user?.login?.toLowerCase() ?? "";
    if (!expandedOwners.includes(login)) continue;
    if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED") {
      latestByOwner.set(login, r.state);
    }
  }
  const approvedByOwner = [...latestByOwner.values()].some((state) => state === "APPROVED");

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
    ...((await ctx.target.labels()).includes(APPROVED_LABEL)
      ? { effects: [{ type: "removeLabels", labels: [APPROVED_LABEL] }] }
      : {}),
  };
}

export const platinumApproval = check({
  id: "code-owner-approval",
  title: "Code owner approval",
  description: "Requires code owner approval for platinum quality scale integrations",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    EventType.PULL_REQUEST_REVIEW_DISMISSED,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
