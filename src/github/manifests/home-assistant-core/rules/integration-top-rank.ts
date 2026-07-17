import { z } from "zod";
import { log } from "../../../../log.js";
import { fetchWithTimeout } from "../../../../util/fetch.js";
import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Effect, Rule } from "../../../engine/types.js";
import { domainsFromFiles, MAX_INTEGRATION_LABELS } from "../helpers/integration-domains.js";
import { ParsedPath } from "../helpers/parse-path.js";
import { addsNewIntegration } from "./file-shape.js";

const ANALYTICS_URL = "https://analytics.home-assistant.io/current_data.json";
const TOP_COUNTS = [50, 100, 200];

const AnalyticsSchema = z.object({
  integrations: z.record(z.string(), z.number()).optional(),
});

async function getTopLabels(parsed: ParsedPath[]): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(ANALYTICS_URL);
    if (!res.ok) return [];
    const parsedData = AnalyticsSchema.safeParse(await res.json());
    if (!parsedData.success) {
      log.warn("getTopLabels: analytics schema mismatch", { issues: parsedData.error.issues });
      return [];
    }
    const data = parsedData.data;
    if (!data.integrations) return [];

    const ranked = Object.entries(data.integrations)
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name);

    let bestRank = Number.POSITIVE_INFINITY;
    for (const file of parsed) {
      if (!file.component) continue;
      const rank = ranked.indexOf(file.component);
      if (rank !== -1 && rank < bestRank) {
        bestRank = rank;
      }
    }

    return TOP_COUNTS.filter((count) => bestRank < count).map((count) => `Top ${count}`);
  } catch (err) {
    log.warn("getTopLabels: analytics fetch failed", { error: String(err) });
    return [];
  }
}

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  const domains = domainsFromFiles(await ctx.target.files());
  if (domains.length === 0 || domains.length > MAX_INTEGRATION_LABELS) {
    return undefined;
  }

  // Skip Top N for PRs that touch core or add a brand-new integration —
  // analytics rank is meaningless in both cases.
  const files = await ctx.target.files();
  const parsed = files.map((f) => new ParsedPath(f));
  if (parsed.some((f) => f.core) || addsNewIntegration(parsed)) {
    return undefined;
  }

  const labels = await getTopLabels(parsed);
  return labels.length > 0 ? [{ type: "addLabels", labels }] : undefined;
}

export const integrationTopRank: Rule = {
  name: "integration-top-rank",
  description:
    "Adds `Top 50/100/200` labels to PRs touching popular integrations, ranked from public analytics.",
  events: on(
    [
      EventType.PULL_REQUEST_OPENED,
      EventType.PULL_REQUEST_EDITED,
      EventType.PULL_REQUEST_SYNCHRONIZE,
      EventType.ON_DEMAND,
    ],
    evaluate,
  ),
};
