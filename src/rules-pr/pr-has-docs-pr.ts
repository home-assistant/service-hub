import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";
import { extractAllLinks } from "../utils/text-parser.js";

type DocsCheckEvent =
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_SYNCHRONIZE;

function evaluate(ctx: WebhookContext<EventPayloadMap[DocsCheckEvent]>): Effect[] {
  const payload = ctx.payload;
  const isReleasePR = payload.pull_request.base.ref === "master";
  const currentLabels = new Set(payload.pull_request.labels.map((l) => l.name));

  let needsDocumentation = currentLabels.has("docs-missing");

  if (
    !needsDocumentation &&
    (currentLabels.has("new-integration") || currentLabels.has("new-platform"))
  ) {
    const linksToDocs = extractAllLinks(payload.pull_request.body).filter(
      (link) => `${link.owner}/${link.repo}` === HomeAssistantRepository.HOME_ASSISTANT_IO,
    );
    needsDocumentation = linksToDocs.length === 0;
  }

  const ok = isReleasePR || !needsDocumentation;

  return [
    {
      type: "statusCheck",
      sha: payload.pull_request.head.sha,
      context: "docs-missing",
      state: ok ? "success" : "failure",
      description: isReleasePR
        ? "Documentation check auto-approved for release PR."
        : needsDocumentation
          ? "Please open a documentation PR."
          : "Documentation ok.",
    },
    {
      type: "dashboardSection",
      section: {
        id: "docs-missing",
        title: "Documentation",
        status: ok ? "pass" : "fail",
        message: isReleasePR
          ? "Auto-approved for release PR"
          : needsDocumentation
            ? "Missing documentation PR"
            : "Documentation PR linked",
      },
    },
  ];
}

export const prHasDocsPr: Rule = {
  name: "docs-missing",
  description: "Checks new integrations and platforms have a linked documentation PR",
  events: {
    [EventType.PULL_REQUEST_EDITED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_LABELED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_UNLABELED]: async (ctx) => evaluate(ctx),
    [EventType.PULL_REQUEST_SYNCHRONIZE]: async (ctx) => evaluate(ctx),
  },
};
