import type { WebhookContext } from "../engine/context.js";
import type { Effect, EventPayloadMap, Rule } from "../engine/types.js";
import { EventType } from "../github/types.js";
import { fetchIntegrationManifest, QualityScale } from "../util/integration.js";

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

async function evaluate(
  ctx: WebhookContext<EventPayloadMap[HandledEvent]>,
): Promise<Effect[] | undefined> {
  const effects: Effect[] = [];

  // Add `quality-scale` label when PR touches `quality_scale.yaml`.
  const files = await ctx.fetchPRFiles();
  const touchesQualityScaleYaml = files.some(
    (f) => f.filename.split("/").pop() === "quality_scale.yaml",
  );
  if (touchesQualityScaleYaml) {
    effects.push({ type: "addLabels", labels: ["quality-scale"] });
  }

  // Resolve which integration domains drive the score: file-derived first
  // (the canonical case), unioned with any `integration:` labels already on
  // the PR (covers manual maintainer adds that file shape doesn't pick up).
  const fileDerived = await ctx.getIntegrationDomains();
  const currentLabels = ctx.payload.pull_request.labels.map((l) => l.name);
  const labelDerived = currentLabels
    .filter((n) => n.startsWith("integration: "))
    .map((n) => n.slice("integration: ".length));
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
      effects.push({ type: "removeLabels", label: stale });
    }
  }

  return effects.length > 0 ? effects : undefined;
}

export const qualityScale: Rule = {
  name: "quality-scale",
  description: "Labels PRs with the highest quality scale among the integrations they touch.",
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_REOPENED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
    [EventType.PULL_REQUEST_LABELED]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
