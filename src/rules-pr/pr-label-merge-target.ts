import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";

const DASHBOARD_SECTION_ID = "merge-target";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

function targetLabel(baseRef: string): string | undefined {
  if (baseRef === "master") return "merging-to-master";
  if (baseRef === "rc") return "merging-to-rc";
  return undefined;
}

async function isOrgMember(ctx: WebhookContext, login: string): Promise<boolean> {
  try {
    const res = await ctx.github.orgs.getMembershipForUser({
      org: ctx.organization,
      username: login,
    });
    return res.data.state === "active";
  } catch (err) {
    // 404 from the GitHub API means "not a member"; surface anything else.
    const status = (err as { status?: number }).status;
    if (status === 404) return false;
    console.warn(
      `pr-label-merge-target: org membership check for ${login} in ${ctx.organization} failed:`,
      err,
    );
    return false;
  }
}

async function evaluate(
  ctx: WebhookContext<EventPayloadMap[HandledEvent]>,
): Promise<Effect[] | undefined> {
  if (ctx.senderIsBot) return undefined;
  const baseRef = ctx.payload.pull_request.base.ref;
  const label = targetLabel(baseRef);
  if (!label) return undefined;

  // Org members occasionally target `master`/`rc` intentionally (release prep,
  // backports), so the row downgrades to informational for them.
  const authorLogin = ctx.payload.pull_request.user.login;
  const member = await isOrgMember(ctx, authorLogin);
  const section = member
    ? {
        id: DASHBOARD_SECTION_ID,
        title: "Merge target",
        status: "info" as const,
        message: `This PR targets \`${baseRef}\` (release branch).`,
      }
    : {
        id: DASHBOARD_SECTION_ID,
        title: "Merge target",
        status: "fail" as const,
        message:
          `This PR targets \`${baseRef}\`, which is reserved for releases. ` +
          "Please retarget the default development branch (typically `dev`).",
      };

  return [
    { type: "addLabels", labels: [label] },
    { type: "dashboardSection", section },
  ];
}

export const prLabelMergeTarget: Rule = {
  name: "pr-label-merge-target",
  description:
    "Labels PRs targeting non-default release branches (`merging-to-master`, " +
    "`merging-to-rc`) and adds a dashboard failure for non-member contributors.",
  dashboardSections: [DASHBOARD_SECTION_ID],
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_EDITED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
