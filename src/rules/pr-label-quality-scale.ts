import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import { fetchIntegrationManifest, QualityScale } from "../utils/integration.js";
import type { Rule, RuleResult } from "./types.js";

export const prLabelQualityScale: Rule = {
  name: "pr-label-quality-scale",
  listens: [EventType.PULL_REQUEST_LABELED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as unknown as {
      label?: { name: string };
    };

    const labels: string[] = [];

    const files = await context.fetchPRFiles();
    const filenames = files.map((f) => f.filename.split("/").pop() ?? "");
    if (filenames.includes("quality_scale.yaml")) {
      labels.push("quality-scale");
    }

    if (payload.label?.name.startsWith("integration: ")) {
      const domain = payload.label.name.split("integration: ")[1];
      const manifest = await fetchIntegrationManifest(domain);
      if (manifest) {
        labels.push(`Quality Scale: ${manifest.quality_scale || QualityScale.NO_SCORE}`);
      }
    }

    if (labels.length > 0) {
      return { labels };
    }
  },
};
