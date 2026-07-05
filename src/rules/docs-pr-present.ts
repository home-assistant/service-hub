import { EventType } from "../engine/event.js";
import { type CheckOutcome, check } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";
import { extractAllLinks } from "../util/pr-body.js";
import { HomeAssistantRepository } from "../util/repositories.js";

type HandledEvent =
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome> {
  const isReleasePR = (await ctx.target.baseRef()) === "master";
  const currentLabels = new Set(await ctx.target.labels());

  const hasNewIntegrationOrPlatform =
    currentLabels.has("new-integration") || currentLabels.has("new-platform");
  const hasDocsMissingLabel = currentLabels.has("docs-missing");
  const docsApplies = hasNewIntegrationOrPlatform || hasDocsMissingLabel;

  // Skip when there's no signal that docs are needed.
  if (!docsApplies && !isReleasePR) {
    return {
      status: "skip",
      message: "Not a new integration or platform — no documentation PR required.",
    };
  }

  // Release PRs auto-approve regardless of docs link.
  if (isReleasePR) {
    return { status: "skip", message: "Auto-approved — release PR." };
  }

  let needsDocumentation = hasDocsMissingLabel;
  if (!needsDocumentation && hasNewIntegrationOrPlatform) {
    const linksToDocs = extractAllLinks(await ctx.target.body()).filter(
      (link) => `${link.owner}/${link.repo}` === HomeAssistantRepository.HOME_ASSISTANT_IO,
    );
    needsDocumentation = linksToDocs.length === 0;
  }

  return {
    status: needsDocumentation ? "fail" : "pass",
    message: needsDocumentation ? "Missing documentation PR" : "Documentation PR linked",
  };
}

export const docsPrPresent = check({
  id: "docs-missing",
  title: "Documentation",
  description: "Checks new integrations and platforms have a linked documentation PR",
  events: [
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
