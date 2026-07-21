import { type ItemRef, slugOf } from "../../../../util/item-ref.js";
import { extractAllLinks } from "../../../../util/pr-body.js";
import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { HomeAssistantRepository } from "../../home-assistant-org.js";
import { ParsedPath } from "../helpers/parse-path.js";
import { NEW_INTEGRATION_LABEL, pickedTypeLabels } from "./change-type.js";
import { addsNewIntegration } from "./file-shape.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.ON_DEMAND;

const RELEVANT_LABELS = new Set(["new-integration", "new-platform", "docs-missing"]);

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  if ("label" in ctx.event && !RELEVANT_LABELS.has(ctx.event.label)) return;

  const isReleasePR = (await ctx.target.baseRef()) === "master";
  const currentLabels = new Set(await ctx.target.labels());

  // Derived from the PR itself (body checkbox, file shape) plus human-applied
  // labels — never from labels other rules maintain.
  const hasNewIntegrationOrPlatform =
    currentLabels.has("new-integration") ||
    currentLabels.has("new-platform") ||
    pickedTypeLabels(await ctx.target.body()).includes(NEW_INTEGRATION_LABEL) ||
    addsNewIntegration((await ctx.target.files()).map((f) => new ParsedPath(f)));
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
      (link): link is ItemRef => slugOf(link) === HomeAssistantRepository.HOME_ASSISTANT_IO,
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
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
