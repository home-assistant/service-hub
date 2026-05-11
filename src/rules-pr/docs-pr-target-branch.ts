import type { PullRequestEditedEvent, PullRequestOpenedEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository, Organization } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";
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

export const docsPrTargetBranch: Rule = {
  name: "docs-pr-target-branch",
  description:
    "Validates docs PRs target the correct branch based on whether they have a parent code PR",
  listens: [EventType.PULL_REQUEST_EDITED, EventType.PULL_REQUEST_OPENED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as PullRequestOpenedEvent | PullRequestEditedEvent;

    const target = payload.pull_request.base.ref;
    if (IGNORE_BRANCHES.has(target)) return;

    const links = extractAllLinks(payload.pull_request.body).filter(
      (link) =>
        link.owner === Organization.HOME_ASSISTANT &&
        !IGNORE_REPOS.has(`${link.owner}/${link.repo}` as HomeAssistantRepository),
    );

    const hasParent = links.length > 0;
    const correctBranch = hasParent ? "next" : "current";

    if (target === correctBranch) {
      // Correct branch — clean up any previous warnings
      const currentLabels = payload.pull_request.labels.map((l) => l.name);
      const result: RuleResult = {};
      if (currentLabels.includes("needs-rebase")) {
        result.removeLabels = ["needs-rebase"];
      }
      if (result.removeLabels) return result;
      return;
    }

    // Wrong branch — only warn once (check if needs-rebase already set)
    const currentLabels = payload.pull_request.labels.map((l) => l.name);
    if (currentLabels.includes("needs-rebase")) return;

    return {
      labels: ["needs-rebase", "in-progress"],
      assignees: [payload.sender.login],
      comment: correctBranch === "next" ? SHOULD_TARGET_NEXT : SHOULD_TARGET_CURRENT,
    };
  },
};
