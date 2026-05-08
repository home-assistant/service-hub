import type { PullRequestEditedEvent, PullRequestOpenedEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository, Organization } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";
import {
  extractIssuesOrPullRequestMarkdownLinks,
  extractPullRequestURLLinks,
} from "../utils/text-parser.js";

export const docsParentingDocsSide: Rule = {
  name: "docs-parenting-docs-side",
  description: "Labels docs PRs with 'has-parent' when they link to a code PR",
  listens: [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_EDITED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as PullRequestOpenedEvent | PullRequestEditedEvent;

    const linksToCode = [
      ...extractIssuesOrPullRequestMarkdownLinks(payload.pull_request.body),
      ...extractPullRequestURLLinks(payload.pull_request.body),
    ].filter(
      (link) =>
        link.owner === Organization.HOME_ASSISTANT &&
        `${link.owner}/${link.repo}` !== HomeAssistantRepository.HOME_ASSISTANT_IO,
    );

    if (linksToCode.length === 0) return;

    return { labels: ["has-parent"] };
  },
};
