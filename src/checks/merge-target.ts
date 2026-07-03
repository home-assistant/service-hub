import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";
import { EventType } from "../github/types.js";

const DASHBOARD_SECTION_ID = "merge-target";
const REQUIRED_BASE_REF = "dev";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[]> {
  const baseRef = await ctx.target.baseRef();
  if (baseRef === REQUIRED_BASE_REF) {
    return [
      {
        type: "dashboardSection",
        section: {
          id: DASHBOARD_SECTION_ID,
          title: "Merge target",
          status: "pass",
          message: `This PR targets \`${REQUIRED_BASE_REF}\`.`,
        },
      },
    ];
  }

  // Org-affiliated authors (release work, backports) get an informational row
  // instead of a hard failure. `author_association` is computed server-side.
  const assoc = await ctx.target.authorAssociation();
  const isMember = assoc === "OWNER" || assoc === "MEMBER" || assoc === "COLLABORATOR";
  return [
    {
      type: "dashboardSection",
      section: {
        id: DASHBOARD_SECTION_ID,
        title: "Merge target",
        status: isMember ? "info" : "fail",
        message: isMember
          ? `This PR targets \`${baseRef}\` (release branch).`
          : `This PR targets \`${baseRef}\`. Please retarget \`${REQUIRED_BASE_REF}\`.`,
      },
    },
  ];
}

export const mergeTarget: Rule = {
  name: "merge-target",
  description: "Requires PRs to target the `dev` branch.",
  dashboardSections: [DASHBOARD_SECTION_ID],
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_EDITED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
