import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import { ParsedPath } from "../utils/parse-path.js";
import type { Rule, RuleResult } from "./types.js";

export const prNewIntegrationValidation: Rule = {
  name: "pr-new-integration-validation",
  listens: [EventType.PULL_REQUEST_LABELED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as unknown as {
      label?: { name: string };
    };

    if (payload.label?.name !== "new-integration") return;

    const files = await context.fetchPRFiles();
    const parsed = files.map((f) => new ParsedPath(f));

    const issues: string[] = [];

    const hasMultiplePlatforms = parsed.filter((p) => p.type === "platform").length > 1;
    if (hasMultiplePlatforms) {
      issues.push(
        "When adding new integrations, limit included platforms to a single platform. Please reduce this PR to a single platform. See the [review process](https://developers.home-assistant.io/docs/review-process/#home-assistant-core) for more details.",
      );
    }

    const hasBrandFolder = parsed.some((p) => p.type === "brand");
    if (hasBrandFolder) {
      issues.push(
        "This PR includes a `brand` folder inside the component. Brand assets should not be part of the core repository. Please refer to the [brand images documentation](https://developers.home-assistant.io/docs/core/integration/brand_images) for the correct approach.",
      );
    }

    if (issues.length === 0) return;

    return { requestChanges: issues.join("\n\n") };
  },
};
