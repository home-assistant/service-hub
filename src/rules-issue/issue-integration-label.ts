import type { IssuesOpenedEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { issuesGetLabel } from "../github/client.js";
import { EventType, entityPlatforms } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";
import { extractIntegrationDocumentationLinks } from "../utils/text-parser.js";

export const issueIntegrationLabel: Rule = {
  name: "issue-integration-label",
  allowBots: false,
  listens: [EventType.ISSUES_OPENED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as IssuesOpenedEvent;

    const labels: string[] = [];

    for (const link of extractIntegrationDocumentationLinks(payload.issue.body)) {
      const integration =
        link.platform && entityPlatforms.has(link.integration) ? link.platform : link.integration;
      const label = `integration: ${integration}`;
      const exists = await issuesGetLabel(
        context.github,
        context.issue({ name: label, repo: "core" }),
      );
      if (exists?.name === label) {
        labels.push(label);
      }
    }

    if (labels.length > 0) {
      return { labels };
    }
  },
};
