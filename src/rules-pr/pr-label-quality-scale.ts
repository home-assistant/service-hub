import { EventType } from "../github/types.js";
import type { Rule } from "../rules/types.js";
import { fetchIntegrationManifest, QualityScale } from "../utils/integration.js";

export const prLabelQualityScale: Rule = {
  name: "pr-label-quality-scale",
  description: "Labels PRs with integration quality scale when an integration label is added",
  events: {
    [EventType.PULL_REQUEST_LABELED]: async (ctx) => {
      const labels: string[] = [];

      const files = await ctx.fetchPRFiles();
      const filenames = files.map((f) => f.filename.split("/").pop() ?? "");
      if (filenames.includes("quality_scale.yaml")) {
        labels.push("quality-scale");
      }

      if (ctx.payload.label?.name.startsWith("integration: ")) {
        const domain = ctx.payload.label.name.split("integration: ")[1];
        const manifest = await fetchIntegrationManifest(domain);
        if (manifest) {
          labels.push(`Quality Scale: ${manifest.quality_scale || QualityScale.NO_SCORE}`);
        }
      }

      if (labels.length > 0) {
        return [{ type: "addLabels", labels }];
      }
    },
  },
};
