import type { IssuesOpenedEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { issuesGetLabel } from "../github/client.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";
import { extractDocumentationSectionsLinks } from "../utils/text-parser.js";

export const issueDocsSectionLabel: Rule = {
  name: "issue-docs-section-label",
  description: "Labels docs issues with documentation section labels extracted from the issue body",
  allowBots: false,
  listens: [EventType.ISSUES_OPENED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as IssuesOpenedEvent;

    const foundSections = extractDocumentationSectionsLinks(payload.issue.body);
    if (foundSections.includes("integrations")) return;

    const labels: string[] = [];
    for (const section of foundSections) {
      const exists = await issuesGetLabel(context.github, context.issue({ name: section }));
      if (exists?.name === section) {
        labels.push(section);
      }
    }

    if (labels.length > 0) {
      return { labels };
    }
  },
};
