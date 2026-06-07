import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";
import { ParsedPath } from "../utils/parse-path.js";

type ValidationEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

const SECTION_ID = "new-integration-validation";
const SECTION_TITLE = "New integration validation";

async function evaluate(ctx: WebhookContext<EventPayloadMap[ValidationEvent]>): Promise<Effect[]> {
  const hasNewIntegrationLabel = ctx.payload.pull_request.labels.some(
    (l) => l.name === "new-integration",
  );
  if (!hasNewIntegrationLabel) {
    return [
      {
        type: "dashboardSection",
        section: {
          id: SECTION_ID,
          title: SECTION_TITLE,
          status: "skip",
          message: "Not a new-integration PR.",
        },
      },
    ];
  }

  const files = await ctx.fetchPRFiles();
  const parsed = files.map((f) => new ParsedPath(f));

  const issues: string[] = [];

  const hasMultiplePlatforms = parsed.filter((p) => p.type === "platform").length > 1;
  if (hasMultiplePlatforms) {
    issues.push(
      "Limit included platforms to a single platform. See the " +
        "[review process](https://developers.home-assistant.io/docs/review-process/#home-assistant-core).",
    );
  }

  const hasBrandFolder = parsed.some((p) => p.type === "brand");
  if (hasBrandFolder) {
    issues.push(
      "Remove the `brand` folder — brand assets don't belong in core. See the " +
        "[brand images docs](https://developers.home-assistant.io/docs/core/integration/brand_images).",
    );
  }

  if (issues.length === 0) {
    return [
      {
        type: "dashboardSection",
        section: {
          id: SECTION_ID,
          title: SECTION_TITLE,
          status: "pass",
          message: "Validation passed.",
        },
      },
    ];
  }

  return [
    {
      type: "dashboardSection",
      section: {
        id: SECTION_ID,
        title: SECTION_TITLE,
        status: "fail",
        message: issues.map((i) => `- ${i}`).join("\n"),
      },
    },
  ];
}

export const prNewIntegrationValidation: Rule = {
  name: "pr-new-integration-validation",
  description: "Validates new-integration PRs for platform count and brand folder placement",
  dashboardSections: [SECTION_ID],
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_REOPENED]: evaluate,
    [EventType.PULL_REQUEST_LABELED]: evaluate,
    [EventType.PULL_REQUEST_UNLABELED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
