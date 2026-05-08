import type { IssuesLabeledEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";

export const issueIntegrationLinks: Rule = {
  name: "issue-integration-links",
  description: "Comments with documentation and source links when an integration label is added",
  listens: [EventType.ISSUES_LABELED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as IssuesLabeledEvent;

    if (!payload.label?.name.startsWith("integration: ")) return;

    const domain = payload.label.name.split("integration: ")[1];
    const docLink = `https://www.home-assistant.io/integrations/${domain}`;
    const codeLink = `https://github.com/home-assistant/core/tree/dev/homeassistant/components/${domain}`;

    return {
      comment: `[${domain} documentation](${docLink})\n[${domain} source](${codeLink})`,
    };
  },
};
