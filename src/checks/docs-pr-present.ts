import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";
import { extractAllLinks } from "../util/pr-body.js";
import { HomeAssistantRepository } from "../util/repositories.js";

type HandledEvent =
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[]> {
  const isReleasePR = (await ctx.target.baseRef()) === "master";
  const currentLabels = new Set(await ctx.target.labels());

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
    const linksToDocs = extractAllLinks(await ctx.target.body()).filter(
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
    [EventType.PULL_REQUEST_EDITED]: evaluate,
    [EventType.PULL_REQUEST_LABELED]: evaluate,
    [EventType.PULL_REQUEST_UNLABELED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
