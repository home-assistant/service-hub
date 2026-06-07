import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";
import { fetchIntegrationManifest, QualityScale } from "../utils/integration.js";

type HandledEvent = EventType.PULL_REQUEST_LABELED | EventType.ON_DEMAND;

// Lowest → highest. Index in this list is the rank. An integration's
// manifest.quality_scale value that isn't in the enum falls back to NO_SCORE.
const QUALITY_SCALE_ORDER: QualityScale[] = [
  QualityScale.NO_SCORE,
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

  const files = await ctx.fetchPRFiles();
  const touchesQualityScaleYaml = files.some(
    (f) => f.filename.split("/").pop() === "quality_scale.yaml",
  );
  if (touchesQualityScaleYaml) {
    effects.push({ type: "addLabels", labels: ["quality-scale"] });
  }

  // Always re-evaluate every integration: label currently on the PR. On
  // LABELED, the webhook fires post-add, so the newly added label is
  // already in pull_request.labels.
  const currentLabels = ctx.payload.pull_request.labels.map((l) => l.name);
  const integrationLabels = currentLabels.filter((n) => n.startsWith("integration: "));

  const scales: QualityScale[] = [];
  for (const labelName of integrationLabels) {
    const domain = labelName.split("integration: ")[1];
    const manifest = await fetchIntegrationManifest(domain);
    if (manifest) {
      scales.push(manifest.quality_scale || QualityScale.NO_SCORE);
    }
  }

  if (scales.length > 0) {
    const newLabel = `Quality Scale: ${highestScale(scales)}`;
    effects.push({ type: "addLabels", labels: [newLabel] });

    // Strip any other `Quality Scale: *` labels — we only show the highest.
    const stale = currentLabels.filter((n) => n.startsWith("Quality Scale: ") && n !== newLabel);
    if (stale.length > 0) {
      effects.push({ type: "removeLabels", label: stale });
    }
  }

  return effects.length > 0 ? effects : undefined;
}

export const prLabelQualityScale: Rule = {
  name: "pr-label-quality-scale",
  description:
    "Labels PRs with the highest integration quality scale among their `integration:` labels.",
  events: {
    [EventType.PULL_REQUEST_LABELED]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
