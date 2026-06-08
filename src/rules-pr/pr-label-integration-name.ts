import { z } from "zod";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";
import { fetchWithTimeout } from "../utils/fetch.js";
import { ParsedPath } from "../utils/parse-path.js";
import { addsNewIntegration } from "./pr-label-file-shape.js";

const MAX_INTEGRATION_LABELS = 5;
const ANALYTICS_URL = "https://analytics.home-assistant.io/current_data.json";
const TOP_COUNTS = [50, 100, 200];

const AnalyticsSchema = z.object({
  integrations: z.record(z.string(), z.number()).optional(),
});

function componentLabels(parsed: ParsedPath[]): string[] {
  return parsed.filter((f) => f.component).map((f) => `integration: ${f.component}`);
}

async function getTopLabels(parsed: ParsedPath[]): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(ANALYTICS_URL);
    if (!res.ok) return [];
    const parsedData = AnalyticsSchema.safeParse(await res.json());
    if (!parsedData.success) {
      console.warn("getTopLabels: analytics schema mismatch:", parsedData.error.issues);
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
    console.warn("getTopLabels: analytics fetch failed:", err);
    return [];
  }
}

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(
  ctx: WebhookContext<EventPayloadMap[HandledEvent]>,
): Promise<Effect[] | undefined> {
  if (ctx.senderIsBot) return undefined;

  const files = await ctx.fetchPRFiles();
  const parsed = files.map((f) => new ParsedPath(f));

  const components = componentLabels(parsed);
  if (components.length === 0 || components.length > MAX_INTEGRATION_LABELS) {
    return undefined;
  }

  const labels = new Set(components);

  // Skip Top N for PRs that touch core or add a brand-new integration —
  // analytics rank is meaningless in both cases.
  const touchesCore = parsed.some((f) => f.core);
  const newIntegration = addsNewIntegration(parsed);
  if (!touchesCore && !newIntegration) {
    for (const label of await getTopLabels(parsed)) labels.add(label);
  }

  return [{ type: "addLabels", labels: [...labels] }];
}

export const prLabelIntegrationName: Rule = {
  name: "pr-label-integration-name",
  description:
    "Labels PRs touching integration code with `integration: <domain>` labels (and " +
    "`Top 50/100/200` derived from public analytics).",
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_EDITED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
