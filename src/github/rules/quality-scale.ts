import { fetchIntegrationManifest, QualityScale } from "../../util/integration.js";
import { EventType } from "../engine/event.js";
import { on } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";
import { INTEGRATION_LABEL_PREFIX } from "./integrations.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_LABELED
  | EventType.ON_DEMAND;

// Lowest → highest. Index in this list is the rank. An integration's
// manifest.quality_scale value that isn't in the enum falls back to NO_SCORE.
const QUALITY_SCALE_ORDER: QualityScale[] = [
  QualityScale.NO_SCORE,
  QualityScale.LEGACY,
  QualityScale.BRONZE,
  QualityScale.SILVER,
  QualityScale.GOLD,
  QualityScale.PLATINUM,
  QualityScale.INTERNAL,
];

function highestScale(scales: QualityScale[]): QualityScale {
  return scales.reduce((best, current) =>
    QUALITY_SCALE_ORDER.indexOf(current) > QUALITY_SCALE_ORDER.indexOf(best) ? current : best,
  );
}

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  // Only integration labels feed the scale; other labels are not our input.
  if ("label" in ctx.event && !ctx.event.label.startsWith(INTEGRATION_LABEL_PREFIX)) return;

  const effects: Effect[] = [];

  // Add `quality-scale` label when PR touches `quality_scale.yaml`.
  const files = await ctx.target.files();
  const touchesQualityScaleYaml = files.some(
    (f) => f.filename.split("/").pop() === "quality_scale.yaml",
  );
  if (touchesQualityScaleYaml) {
    effects.push({ type: "addLabels", labels: ["quality-scale"] });
  }

  // Resolve which integration domains drive the score: file-derived first
  // (the canonical case), unioned with any `integration:` labels already on
  // the PR (covers manual maintainer adds that file shape doesn't pick up).
  const fileDerived = await ctx.target.integrationDomains();
  const currentLabels = await ctx.target.labels();
  const labelDerived = currentLabels
    .filter((n) => n.startsWith(INTEGRATION_LABEL_PREFIX))
    .map((n) => n.slice(INTEGRATION_LABEL_PREFIX.length));
  const domains = [...new Set([...fileDerived, ...labelDerived])];

  const scales: QualityScale[] = [];
  for (const domain of domains) {
    const manifest = await fetchIntegrationManifest(domain);
    if (manifest) {
      scales.push(manifest.quality_scale || QualityScale.NO_SCORE);
    }
  }

  if (scales.length > 0) {
    const newLabel = `Quality Scale: ${highestScale(scales)}`;
    effects.push({ type: "addLabels", labels: [newLabel] });

    const stale = currentLabels.filter((n) => n.startsWith("Quality Scale: ") && n !== newLabel);
    if (stale.length > 0) {
      effects.push({ type: "removeLabels", labels: stale });
    }
  }

  return effects.length > 0 ? effects : undefined;
}

export const qualityScale: Rule = {
  name: "quality-scale",
  description: "Labels PRs with the highest quality scale among the integrations they touch.",
  events: on(
    [
      EventType.PULL_REQUEST_OPENED,
      EventType.PULL_REQUEST_REOPENED,
      EventType.PULL_REQUEST_SYNCHRONIZE,
      EventType.PULL_REQUEST_LABELED,
      EventType.ON_DEMAND,
    ],
    evaluate,
  ),
};
