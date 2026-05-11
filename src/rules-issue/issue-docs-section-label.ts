import { issuesGetLabel } from "../github/client.js";
import { EventType } from "../github/types.js";
import type { Rule } from "../rules/types.js";
import { extractDocumentationSectionsLinks } from "../utils/text-parser.js";

export const issueDocsSectionLabel: Rule = {
  name: "issue-docs-section-label",
  description: "Labels docs issues with documentation section labels extracted from the issue body",
  allowBots: false,
  events: {
    [EventType.ISSUES_OPENED]: async (ctx) => {
      const foundSections = extractDocumentationSectionsLinks(ctx.payload.issue.body);
      if (foundSections.includes("integrations")) return;

      const labels: string[] = [];
      for (const section of foundSections) {
        const exists = await issuesGetLabel(ctx.github, ctx.issue({ name: section }));
        if (exists?.name === section) {
          labels.push(section);
        }
      }

      if (labels.length > 0) {
        return [{ type: "addLabels", labels }];
      }
    },
  },
};
