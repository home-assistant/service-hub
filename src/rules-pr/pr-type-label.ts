import { z } from "zod";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";
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

const TYPE_OF_CHANGE_LABELS = new Set(BODY_MATCHES.flatMap((m) => m.labels));
const DASHBOARD_SECTION_ID = "type-of-change";

const METADATA_FILES = new Set([
  "CODEOWNERS",
  "manifest.json",
  "requirements_all.txt",
  "requirements_docs.txt",
  "requirements_test.txt",
  "requirements_test_all.txt",
  "services.yaml",
]);

// --- Body / file strategies ---

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

type TypeOfChangeSelection = "none" | "single" | "multiple";

function typeOfChange(body: string | null): {
  labels: string[];
  selection: TypeOfChangeSelection;
} {
  const completedTasks = extractTasks(body)
    .filter((t) => t.checked)
    .map((t) => t.description);

  const matches = BODY_MATCHES.filter((m) => completedTasks.includes(m.description));
  if (matches.length === 0) return { labels: [], selection: "none" };
  if (matches.length > 1) return { labels: [], selection: "multiple" };
  return { labels: matches[0].labels, selection: "single" };
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

// --- Dashboard row (body-driven only) ---

function describeTypeSelection(
  selection: TypeOfChangeSelection,
  pickedLabel: string | undefined,
): { status: "pass" | "fail"; message: string } {
  switch (selection) {
    case "none":
      return {
        status: "fail",
        message: "Please check one **Type of change** box in the PR description.",
      };
    case "multiple":
      return {
        status: "fail",
        message: "Multiple **Type of change** boxes checked — please pick only one.",
      };
    case "single":
      return {
        status: "pass",
        message: `Type of change: \`${pickedLabel}\``,
      };
  }
}

// --- Handler ---

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function handleAutoLabel(
  ctx: WebhookContext<EventPayloadMap[HandledEvent]>,
): Promise<Effect[]> {
  const effects: Effect[] = [];
  const typeResult = typeOfChange(ctx.payload.pull_request.body);

  // Bot senders skip auto-labeling (their bodies/files aren't human-authored),
  // but the dashboard row still reflects the PR description state below.
  if (!ctx.senderIsBot) {
    const files = await ctx.fetchPRFiles();
    const parsed = files.map((f) => new ParsedPath(f));

    const labels = new Set<string>();
    for (const label of configFlow(parsed)) labels.add(label);
    for (const label of hasTests(parsed)) labels.add(label);
    for (const label of markCore(parsed)) labels.add(label);
    for (const label of newIntegrationOrPlatform(parsed)) labels.add(label);
    for (const label of removePlatform(parsed)) labels.add(label);
    for (const label of smallPR(parsed)) labels.add(label);
    for (const label of typeResult.labels) labels.add(label);
    for (const label of warnOnMergeTarget(ctx.payload.pull_request.base.ref)) labels.add(label);
    for (const label of metadataOnly(parsed)) labels.add(label);

    const componentLabels = componentAndPlatform(parsed);
    if (componentLabels.length <= MAX_INTEGRATION_LABELS) {
      for (const label of componentLabels) labels.add(label);
      if (![...LABELS_PREVENT_TOP].some((l) => labels.has(l))) {
        for (const label of await getTopLabels(parsed)) labels.add(label);
      }
    }

    if (labels.size > 0) effects.push({ type: "addLabels", labels: [...labels] });

    // Sync stale type-of-change labels off the PR based on the body:
    //   "single"   — keep the picked one, remove the others
    //   "none"     — remove every type-of-change label
    //   "multiple" — leave everything alone (we can't tell which is "right")
    if (typeResult.selection !== "multiple") {
      const picked = new Set(typeResult.labels);
      const current = new Set(ctx.payload.pull_request.labels.map((l) => l.name));
      const toRemove = [...TYPE_OF_CHANGE_LABELS].filter(
        (candidate) => current.has(candidate) && !picked.has(candidate),
      );
      if (toRemove.length > 0) {
        effects.push({ type: "removeLabels", label: toRemove });
      }
    }
  }

  // Dashboard row: purely body-driven (no dependence on current labels).
  // The aggregate `ha-bot` status check is synthesized by the dispatcher from
  // this and any other dashboard sections — no per-rule statusCheck needed.
  const row = describeTypeSelection(typeResult.selection, typeResult.labels[0]);
  effects.push({
    type: "dashboardSection",
    section: {
      id: DASHBOARD_SECTION_ID,
      title: "Type of change",
      status: row.status,
      message: row.message,
    },
  });

  return effects;
}

export const PrTypeLabel: Rule = {
  name: "pr-core-pr-type-label",
  description:
    "Core-repo PR labeling: auto-applies labels from changed files + PR body, and " +
    "surfaces the PR's type-of-change state as a dashboard row.",
  dashboardSections: [DASHBOARD_SECTION_ID],
  events: {
    [EventType.PULL_REQUEST_OPENED]: handleAutoLabel,
    [EventType.PULL_REQUEST_EDITED]: handleAutoLabel,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: handleAutoLabel,
    [EventType.ON_DEMAND]: handleAutoLabel,
  },
};
