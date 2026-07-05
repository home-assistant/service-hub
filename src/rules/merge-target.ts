import { EventType } from "../engine/event.js";
import { type CheckOutcome, check } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";

const REQUIRED_BASE_REF = "dev";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome> {
  const baseRef = await ctx.target.baseRef();
  if (baseRef === REQUIRED_BASE_REF) {
    return { status: "pass", message: `This PR targets \`${REQUIRED_BASE_REF}\`.` };
  }

  // Org-affiliated authors (release work, backports) get a warning row
  // instead of a hard failure.
  const isMember = await ctx.target.authorIsMember();
  return {
    status: isMember ? "warn" : "fail",
    message: isMember
      ? `This PR targets \`${baseRef}\` (release branch).`
      : `This PR targets \`${baseRef}\`. Please retarget \`${REQUIRED_BASE_REF}\`.`,
  };
}

export const mergeTarget = check({
  id: "merge-target",
  title: "Merge target",
  description: "Requires PRs to target the `dev` branch.",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
