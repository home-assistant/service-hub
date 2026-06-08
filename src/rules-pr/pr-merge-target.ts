import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";

const DASHBOARD_SECTION_ID = "merge-target";
const REQUIRED_BASE_REF = "dev";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

function evaluate(ctx: WebhookContext<EventPayloadMap[HandledEvent]>): Effect[] {
  const baseRef = ctx.payload.pull_request.base.ref;
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
  const assoc = ctx.payload.pull_request.author_association;
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

export const prMergeTarget: Rule = {
  name: "pr-merge-target",
  description: "Requires PRs to target the `dev` branch.",
  dashboardSections: [DASHBOARD_SECTION_ID],
  events: {
    [EventType.PULL_REQUEST_OPENED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_EDITED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_SYNCHRONIZE]: async (ctx) => evaluate(ctx),
    [EventType.ON_DEMAND]: async (ctx) => evaluate(ctx),
  },
};
