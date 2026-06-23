import type { WebhookContext } from "../engine/context.js";
import type { Effect, EventPayloadMap, Rule } from "../engine/types.js";
import { EventType } from "../github/types.js";
import { ParsedPath } from "../util/parse-path.js";
import { extractTasks } from "../util/pr-body.js";
import { addsNewIntegration } from "./file-shape.js";

const NEW_INTEGRATION_LABEL = "new-integration";
const DASHBOARD_SECTION_ID = "type-of-change";

const BODY_MATCHES: { description: string; labels: string[] }[] = [
  { description: "Bugfix (non-breaking change which fixes an issue)", labels: ["bugfix"] },
  { description: "Dependency upgrade", labels: ["dependency"] },
  { description: "New integration (thank you!)", labels: [NEW_INTEGRATION_LABEL] },
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

function pickedTypeLabels(body: string | null): string[] {
  const completedTasks = extractTasks(body)
    .filter((t) => t.checked)
    .map((t) => t.description);
  return BODY_MATCHES.filter((m) => completedTasks.includes(m.description)).flatMap(
    (m) => m.labels,
  );
}

function formatPicked(labels: string[]): string {
  return labels.map((l) => `\`${l}\``).join(", ");
}

type RowState =
  | { kind: "none" }
  | { kind: "missing-new-integration"; picked: string[] }
  | { kind: "spurious-new-integration" }
  | { kind: "ok"; picked: string[] };

function describeRow(state: RowState): { status: "pass" | "fail"; message: string } {
  switch (state.kind) {
    case "none":
      return {
        status: "fail",
        message: "Please check at least one **Type of change** box in the PR description.",
      };
    case "missing-new-integration":
      return {
        status: "fail",
        message:
          `This PR adds a new integration but ${formatPicked(state.picked)} ` +
          (state.picked.length === 1 ? "is" : "are") +
          " checked — please also tick **New integration**.",
      };
    case "spurious-new-integration":
      return {
        status: "fail",
        message:
          "**New integration** is checked but no new integration directory is added in this PR.",
      };
    case "ok":
      return {
        status: "pass",
        message: `Type of change: ${formatPicked(state.picked)}`,
      };
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
  const effects: Effect[] = [];
  const picked = pickedTypeLabels(ctx.payload.pull_request.body);

  if (picked.length > 0) {
    effects.push({ type: "addLabels", labels: picked });
  }

  // Sync stale type-of-change labels off the PR based on the body. Multiple
  // checked boxes are valid (a PR can be both a `bugfix` and a `breaking-change`),
  // so the cleanup always runs against the picked set.
  const pickedSet = new Set(picked);
  const current = new Set(ctx.payload.pull_request.labels.map((l) => l.name));
  const toRemove = [...TYPE_OF_CHANGE_LABELS].filter(
    (candidate) => current.has(candidate) && !pickedSet.has(candidate),
  );
  if (toRemove.length > 0) {
    effects.push({ type: "removeLabels", label: toRemove });
  }

  // Consistency check: file shape vs. body checkbox, scoped to "new-integration"
  // (the only Type-of-change checkbox whose presence is reliably detectable
  // from file shape).
  let rowState: RowState;
  if (picked.length === 0) {
    rowState = { kind: "none" };
  } else {
    const files = await ctx.fetchPRFiles();
    const parsed = files.map((f) => new ParsedPath(f));
    const addsIntegration = addsNewIntegration(parsed);
    const newIntegrationPicked = picked.includes(NEW_INTEGRATION_LABEL);
    if (newIntegrationPicked && !addsIntegration) {
      rowState = { kind: "spurious-new-integration" };
    } else if (!newIntegrationPicked && addsIntegration) {
      rowState = { kind: "missing-new-integration", picked };
    } else {
      rowState = { kind: "ok", picked };
    }
  }

  const row = describeRow(rowState);
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

export const changeType: Rule = {
  name: "type-of-change",
  description:
    "Labels PRs with the change type(s) checked in the PR description (`bugfix`, " +
    "`new-integration`, …), keeps those labels in sync with the body, and surfaces " +
    "the type-of-change state — including a file-shape consistency check for " +
    "`new-integration` — as a dashboard row.",
  allowBots: false,
  dashboardSections: [DASHBOARD_SECTION_ID],
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_EDITED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
