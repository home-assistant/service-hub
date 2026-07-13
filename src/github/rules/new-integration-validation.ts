import { ParsedPath } from "../../util/parse-path.js";
import { EventType } from "../engine/event.js";
import { type CheckOutcome, check } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";
import { NEW_INTEGRATION_LABEL, pickedTypeLabels } from "./change-type.js";
import { addsNewIntegration } from "./file-shape.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  if ("label" in ctx.event && ctx.event.label !== NEW_INTEGRATION_LABEL) return;

  const files = await ctx.target.files();
  const parsed = files.map((f) => new ParsedPath(f));

  // Derived from the PR itself (body checkbox, file shape) plus human-applied
  // labels — never from labels other rules maintain.
  const isNewIntegration =
    (await ctx.target.labels()).includes(NEW_INTEGRATION_LABEL) ||
    pickedTypeLabels(await ctx.target.body()).includes(NEW_INTEGRATION_LABEL) ||
    addsNewIntegration(parsed);
  if (!isNewIntegration) {
    return { status: "skip", message: "Not a new-integration PR." };
  }

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
    return { status: "pass", message: "Validation passed." };
  }
  return { status: "fail", message: issues.map((i) => `- ${i}`).join("\n") };
}

export const newIntegrationValidation = check({
  id: "new-integration-validation",
  title: "New integration validation",
  description: "Validates new-integration PRs for platform count and brand folder placement",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
