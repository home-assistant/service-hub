import { z } from "zod";
import { EventType } from "../github/types.js";
import type { Rule } from "../rules/types.js";
import { fetchWithTimeout } from "../utils/fetch.js";
import { ParsedPath } from "../utils/parse-path.js";
import { extractTasks } from "../utils/text-parser.js";

const AnalyticsSchema = z.object({
  integrations: z.record(z.string(), z.number()).optional(),
});

const MAX_INTEGRATION_LABELS = 5;
const SMALL_PR_THRESHOLD = 30;
const LABELS_PREVENT_TOP = new Set(["core", "new-integration"]);

const ANALYTICS_URL = "https://analytics.home-assistant.io/current_data.json";
const TOP_COUNTS = [50, 100, 200];

const BODY_MATCHES: { description: string; labels: string[] }[] = [
  { description: "Bugfix (non-breaking change which fixes an issue)", labels: ["bugfix"] },
  { description: "Dependency upgrade", labels: ["dependency"] },
  { description: "New integration (thank you!)", labels: ["new-integration"] },
  {
    description: "New feature (which adds functionality to an existing integration)",
    labels: ["new-feature"],
  },
  {
    description: "Deprecation (breaking change to happen in the future)",
    labels: ["deprecation"],
  },
  {
    description: "Breaking change (fix/feature causing existing functionality to break)",
    labels: ["breaking-change"],
  },
  {
    description: "Code quality improvements to existing code or addition of tests",
    labels: ["code-quality"],
  },
];

const METADATA_FILES = new Set([
  "CODEOWNERS",
  "manifest.json",
  "requirements_all.txt",
  "requirements_docs.txt",
  "requirements_test.txt",
  "requirements_test_all.txt",
  "services.yaml",
]);

// --- Strategies ---

function componentAndPlatform(parsed: ParsedPath[]): string[] {
  return parsed.filter((f) => f.component).map((f) => `integration: ${f.component}`);
}

function configFlow(parsed: ParsedPath[]): string[] {
  const addedFlows = new Set(
    parsed
      .filter(
        (f) => f.type === "component" && f.status === "added" && f.filename === "config_flow.py",
      )
      .map((f) => f.component),
  );
  for (const f of parsed) {
    if (f.type === "component" && f.status === "added" && f.filename === "__init__.py") {
      addedFlows.delete(f.component);
    }
  }
  return addedFlows.size > 0 ? ["config-flow"] : [];
}

function hasTests(parsed: ParsedPath[]): string[] {
  return parsed.some((f) => f.type === "test") ? ["has-tests"] : [];
}

function markCore(parsed: ParsedPath[]): string[] {
  return parsed.some((f) => f.core) ? ["core"] : [];
}

function newIntegrationOrPlatform(parsed: ParsedPath[]): string[] {
  if (
    parsed.some(
      (f) => f.type === "component" && f.status === "added" && f.filename === "__init__.py",
    )
  ) {
    return ["new-integration"];
  }
  if (parsed.some((f) => f.type === "platform" && f.status === "added")) {
    return ["new-platform"];
  }
  return [];
}

function removePlatform(parsed: ParsedPath[]): string[] {
  return parsed.some((f) => f.type === "platform" && f.status === "removed")
    ? ["remove-platform"]
    : [];
}

function smallPR(parsed: ParsedPath[]): string[] {
  const additions = parsed.reduce(
    (total, f) => (f.type === "test" || f.type === null ? total : total + f.additions),
    0,
  );
  return additions < SMALL_PR_THRESHOLD ? ["small-pr"] : [];
}

function typeOfChange(body: string | null): string[] {
  const completedTasks = extractTasks(body)
    .filter((t) => t.checked)
    .map((t) => t.description);

  return BODY_MATCHES.filter((m) => completedTasks.includes(m.description)).flatMap(
    (m) => m.labels,
  );
}

function warnOnMergeTarget(baseRef: string): string[] {
  if (baseRef === "master") return ["merging-to-master"];
  if (baseRef === "rc") return ["merging-to-rc"];
  return [];
}

function metadataOnly(parsed: ParsedPath[]): string[] {
  return parsed.every((f) => METADATA_FILES.has(f.filename)) ? ["metadata-only"] : [];
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

// --- Rule ---

export const prAutoLabel: Rule = {
  name: "pr-auto-label",
  description: "Auto-labels PRs based on changed files, PR body, and integration analytics",
  allowBots: false,
  events: {
    [EventType.PULL_REQUEST_OPENED]: async (ctx) => {
      const files = await ctx.fetchPRFiles();
      const parsed = files.map((f) => new ParsedPath(f));

      const labels = new Set<string>();
      for (const label of configFlow(parsed)) labels.add(label);
      for (const label of hasTests(parsed)) labels.add(label);
      for (const label of markCore(parsed)) labels.add(label);
      for (const label of newIntegrationOrPlatform(parsed)) labels.add(label);
      for (const label of removePlatform(parsed)) labels.add(label);
      for (const label of smallPR(parsed)) labels.add(label);
      for (const label of typeOfChange(ctx.payload.pull_request.body)) labels.add(label);
      for (const label of warnOnMergeTarget(ctx.payload.pull_request.base.ref)) labels.add(label);
      for (const label of metadataOnly(parsed)) labels.add(label);

      const componentLabels = componentAndPlatform(parsed);
      if (componentLabels.length <= MAX_INTEGRATION_LABELS) {
        for (const label of componentLabels) labels.add(label);
        if (![...LABELS_PREVENT_TOP].some((l) => labels.has(l))) {
          for (const label of await getTopLabels(parsed)) labels.add(label);
        }
      }

      if (labels.size > 0) {
        return [{ type: "addLabels", labels: [...labels] }];
      }
    },
  },
};
