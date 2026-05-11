import { issuesGetLabel } from "../github/client.js";
import { EventType, entityPlatforms } from "../github/types.js";
import type { Rule } from "../rules/types.js";
import { extractIntegrationDocumentationLinks } from "../utils/text-parser.js";

export const issueIntegrationLabel: Rule = {
  name: "issue-integration-label",
  description:
    "Labels issues with integration labels extracted from documentation links in the body",
  allowBots: false,
  events: {
    [EventType.ISSUES_OPENED]: async (ctx) => {
      const labels: string[] = [];

      for (const link of extractIntegrationDocumentationLinks(ctx.payload.issue.body)) {
        const integration =
          link.platform && entityPlatforms.has(link.integration) ? link.platform : link.integration;
        const label = `integration: ${integration}`;
        const exists = await issuesGetLabel(ctx.github, ctx.issue({ name: label, repo: "core" }));
        if (exists?.name === label) {
          labels.push(label);
        }
      }

      if (labels.length > 0) {
        return [{ type: "addLabels", labels }];
      }
    },
  },
};
