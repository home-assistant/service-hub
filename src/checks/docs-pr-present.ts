import type { WebhookContext } from "../engine/context.js";
import type { Effect, EventPayloadMap, Rule } from "../engine/types.js";
import { EventType } from "../github/types.js";
import { extractAllLinks } from "../util/pr-body.js";
import { HomeAssistantRepository } from "../util/repositories.js";

type HandledEvent =
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

function evaluate(ctx: WebhookContext<EventPayloadMap[HandledEvent]>): Effect[] {
  const payload = ctx.payload;
  const isReleasePR = payload.pull_request.base.ref === "master";
  const currentLabels = new Set(payload.pull_request.labels.map((l) => l.name));

  const hasNewIntegrationOrPlatform =
    currentLabels.has("new-integration") || currentLabels.has("new-platform");
  const hasDocsMissingLabel = currentLabels.has("docs-missing");
  const docsApplies = hasNewIntegrationOrPlatform || hasDocsMissingLabel;

  // Skip when there's no signal that docs are needed.
  if (!docsApplies && !isReleasePR) {
    return [
      {
        type: "dashboardSection",
        section: {
          id: "docs-missing",
          title: "Documentation",
          status: "skip",
          message: "Not a new integration or platform — no documentation PR required.",
        },
      },
    ];
  }

  // Release PRs auto-approve regardless of docs link.
  if (isReleasePR) {
    return [
      {
        type: "dashboardSection",
        section: {
          id: "docs-missing",
          title: "Documentation",
          status: "skip",
          message: "Auto-approved — release PR.",
        },
      },
    ];
  }

  let needsDocumentation = hasDocsMissingLabel;
  if (!needsDocumentation && hasNewIntegrationOrPlatform) {
    const linksToDocs = extractAllLinks(payload.pull_request.body).filter(
      (link) => `${link.owner}/${link.repo}` === HomeAssistantRepository.HOME_ASSISTANT_IO,
    );
    needsDocumentation = linksToDocs.length === 0;
  }

  return [
    {
      type: "dashboardSection",
      section: {
        id: "docs-missing",
        title: "Documentation",
        status: needsDocumentation ? "fail" : "pass",
        message: needsDocumentation ? "Missing documentation PR" : "Documentation PR linked",
      },
    },
  ];
}

export const docsPrPresent: Rule = {
  name: "docs-missing",
  description: "Checks new integrations and platforms have a linked documentation PR",
  dashboardSections: ["docs-missing"],
  events: {
    [EventType.PULL_REQUEST_EDITED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_LABELED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_UNLABELED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_SYNCHRONIZE]: async (ctx) => evaluate(ctx),
    [EventType.ON_DEMAND]: async (ctx) => evaluate(ctx),
  },
};
