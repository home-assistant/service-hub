import { EventType } from "../github/types.js";
import type { Rule } from "../rules/types.js";

export const issueIntegrationLinks: Rule = {
  name: "issue-integration-links",
  description: "Comments with documentation and source links when an integration label is added",
  events: {
    [EventType.ISSUES_LABELED]: async (ctx) => {
      if (!ctx.payload.label?.name.startsWith("integration: ")) return;

      const domain = ctx.payload.label.name.split("integration: ")[1];
      const docLink = `https://www.home-assistant.io/integrations/${domain}`;
      const codeLink = `https://github.com/home-assistant/core/tree/dev/homeassistant/components/${domain}`;

      return [
        {
          type: "comment",
          body: `[${domain} documentation](${docLink})\n[${domain} source](${codeLink})`,
        },
      ];
    },
  },
};
