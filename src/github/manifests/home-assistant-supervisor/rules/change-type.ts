import { extractTasks } from "../../../../util/pr-body.js";
import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import type { Effect } from "../../../engine/types.js";

// Matches the Supervisor PR template checkboxes:
// https://github.com/home-assistant/supervisor/blob/main/.github/PULL_REQUEST_TEMPLATE.md
const BODY_MATCHES: { description: string; label: string }[] = [
  { description: "Dependency upgrade", label: "dependencies" },
  { description: "Bugfix (non-breaking change which fixes an issue)", label: "bugfix" },
  {
    description: "New feature (which adds functionality to the supervisor)",
    label: "new-feature",
  },
  {
    description: "Breaking change (fix/feature causing existing functionality to break)",
    label: "breaking-change",
  },
  {
    description: "Code quality improvements to existing code or addition of tests",
    label: "refactor",
  },
];

const BODY_LABELS = new Set(BODY_MATCHES.map((m) => m.label));

// Labels that satisfy the check. Wider than the template checkboxes — release
// tooling and maintainers classify PRs with labels the template doesn't offer.
const ACCEPTED_LABELS = new Set([
  "breaking-change",
  "new-feature",
  "bugfix",
  "style",
  "refactor",
  "performance",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
  "dependencies",
]);

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  // Only labels that feed the check can change its conclusion.
  if ("label" in ctx.event && !ACCEPTED_LABELS.has(ctx.event.label)) return;

  const completedTasks = extractTasks(await ctx.target.body())
    .filter((t) => t.checked)
    .map((t) => t.description);
  const picked = BODY_MATCHES.filter((m) => completedTasks.includes(m.description)).map(
    (m) => m.label,
  );

  const effects: Effect[] = [];
  if (picked.length > 0) {
    effects.push({ type: "addLabels", labels: picked });
  }

  // Sync stale body-derived labels off the PR; manually-applied labels
  // outside the template's vocabulary are left alone.
  const pickedSet = new Set(picked);
  const current = new Set(await ctx.target.labels());
  const toRemove = [...BODY_LABELS].filter((l) => current.has(l) && !pickedSet.has(l));
  if (toRemove.length > 0) {
    effects.push({ type: "removeLabels", labels: toRemove });
  }

  const satisfied = [...new Set([...current, ...picked])].filter((l) => ACCEPTED_LABELS.has(l));
  if (satisfied.length === 0) {
    return {
      status: "fail",
      message: "Please check at least one **Type of change** box in the PR description.",
      effects,
    };
  }

  return {
    status: "pass",
    message: `Type of change: ${satisfied.map((l) => `\`${l}\``).join(", ")}`,
    effects,
  };
}

export const changeType = check({
  id: "type-of-change",
  title: "Type of change",
  description:
    "Labels PRs with the change type(s) checked in the PR description and requires at " +
    "least one change-type label.",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
