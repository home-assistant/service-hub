import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "./types.js";

export const issueIntegrationLinks: Rule = {
  name: "issue-integration-links",
  listens: [EventType.ISSUES_LABELED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as unknown as {
      label?: { name: string };
    };

    if (!payload.label?.name.startsWith("integration: ")) return;

    const domain = payload.label.name.split("integration: ")[1];
    const docLink = `https://www.home-assistant.io/integrations/${domain}`;
    const codeLink = `https://github.com/home-assistant/core/tree/dev/homeassistant/components/${domain}`;

    return {
      comment: `[${domain} documentation](${docLink})\n[${domain} source](${codeLink})`,
    };
  },
};
