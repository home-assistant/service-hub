import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository, Organization } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";
import { extractAllLinks } from "../utils/text-parser.js";

const IGNORE_REPOS = new Set([
  HomeAssistantRepository.BRANDS,
  HomeAssistantRepository.DEVELOPERS_HOME_ASSISTANT,
]);
const IGNORE_BRANCHES = new Set(["new"]);

const SHOULD_TARGET_CURRENT =
  "It seems that this PR is targeted against an incorrect branch. Documentation updates which apply to our current stable release should target the `current` branch. Please change the target branch of this PR to `current` and rebase if needed. If this is documentation for a new feature, please add a link to that PR in your description.";
const SHOULD_TARGET_NEXT =
  "It seems that this PR is targeted against an incorrect branch since it has a parent PR on one of our codebases. Documentation that needs to be updated for an upcoming release should target the `next` branch. Please change the target branch of this PR to `next` and rebase if needed.";

function evaluate(
  ctx: WebhookContext<
    EventPayloadMap[EventType.PULL_REQUEST_OPENED] | EventPayloadMap[EventType.PULL_REQUEST_EDITED]
  >,
): Effect[] | undefined {
  const target = ctx.payload.pull_request.base.ref;
  if (IGNORE_BRANCHES.has(target)) return;

  const links = extractAllLinks(ctx.payload.pull_request.body).filter(
    (link) =>
      link.owner === Organization.HOME_ASSISTANT &&
      !IGNORE_REPOS.has(`${link.owner}/${link.repo}` as HomeAssistantRepository),
  );

  const hasParent = links.length > 0;
  const correctBranch = hasParent ? "next" : "current";
  const currentLabels = ctx.payload.pull_request.labels.map((l) => l.name);

  if (target === correctBranch) {
    if (currentLabels.includes("needs-rebase")) {
      return [{ type: "removeLabel", label: "needs-rebase" }];
    }
    return;
  }

  // Wrong branch — only warn once.
  if (currentLabels.includes("needs-rebase")) return;

  return [
    { type: "addLabels", labels: ["needs-rebase", "in-progress"] },
    { type: "addAssignees", assignees: [ctx.payload.sender.login] },
    {
      type: "comment",
      body: correctBranch === "next" ? SHOULD_TARGET_NEXT : SHOULD_TARGET_CURRENT,
    },
  ];
}

export const docsPrTargetBranch: Rule = {
  name: "docs-pr-target-branch",
  description:
    "Validates docs PRs target the correct branch based on whether they have a parent code PR",
  events: {
    [EventType.PULL_REQUEST_OPENED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_EDITED]: async (ctx) => evaluate(ctx),
  },
};
