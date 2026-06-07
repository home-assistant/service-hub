import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";
import { fetchIntegrationManifest, QualityScale } from "../utils/integration.js";

type HandledEvent = EventType.PULL_REQUEST_LABELED | EventType.ON_DEMAND;

async function evaluate(
  ctx: WebhookContext<EventPayloadMap[HandledEvent]>,
): Promise<Effect[] | undefined> {
  const labels: string[] = [];

  const files = await ctx.fetchPRFiles();
  const filenames = files.map((f) => f.filename.split("/").pop() ?? "");
  if (filenames.includes("quality_scale.yaml")) {
    labels.push("quality-scale");
  }

  // On ON_DEMAND: re-evaluate every integration: label currently on the PR.
  // On LABELED: only the affected label matters.
  const integrationLabelsToProcess: string[] = [];
  if (ctx.eventType === EventType.ON_DEMAND) {
    integrationLabelsToProcess.push(
      ...ctx.payload.pull_request.labels
        .map((l) => l.name)
        .filter((n) => n.startsWith("integration: ")),
    );
  } else {
    const labeled = ctx.payload as EventPayloadMap[EventType.PULL_REQUEST_LABELED];
    if (labeled.label?.name.startsWith("integration: ")) {
      integrationLabelsToProcess.push(labeled.label.name);
    }
  }

  for (const labelName of integrationLabelsToProcess) {
    const domain = labelName.split("integration: ")[1];
    const manifest = await fetchIntegrationManifest(domain);
    if (manifest) {
      labels.push(`Quality Scale: ${manifest.quality_scale || QualityScale.NO_SCORE}`);
    }
  }

  if (labels.length > 0) {
    return [{ type: "addLabels", labels }];
  }
}

export const prLabelQualityScale: Rule = {
  name: "pr-label-quality-scale",
  description: "Labels PRs with integration quality scale when an integration label is added",
  events: {
    [EventType.PULL_REQUEST_LABELED]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
