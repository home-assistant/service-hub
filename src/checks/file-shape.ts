import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";
import { EventType } from "../github/types.js";
import { ParsedPath } from "../util/parse-path.js";

const SMALL_PR_THRESHOLD = 30;

const METADATA_FILES = new Set([
  "CODEOWNERS",
  "manifest.json",
  "requirements_all.txt",
  "requirements_docs.txt",
  "requirements_test.txt",
  "requirements_test_all.txt",
  "services.yaml",
]);

function configFlow(parsed: ParsedPath[]): boolean {
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
  return addedFlows.size > 0;
}

function hasTests(parsed: ParsedPath[]): boolean {
  return parsed.some((f) => f.type === "test");
}

function touchesCore(parsed: ParsedPath[]): boolean {
  return parsed.some((f) => f.core);
}

export function addsNewIntegration(parsed: ParsedPath[]): boolean {
  return parsed.some(
    (f) => f.type === "component" && f.status === "added" && f.filename === "__init__.py",
  );
}

function addsPlatform(parsed: ParsedPath[]): boolean {
  // Platform files added as part of a brand-new integration are first-commit
  // scaffolding, not the addition of a platform to an existing integration —
  // `pr-label-change-type` owns the `new-integration` signal in that case.
  if (addsNewIntegration(parsed)) return false;
  return parsed.some((f) => f.type === "platform" && f.status === "added");
}

function removesPlatform(parsed: ParsedPath[]): boolean {
  return parsed.some((f) => f.type === "platform" && f.status === "removed");
}

function isSmall(parsed: ParsedPath[]): boolean {
  const additions = parsed.reduce(
    (total, f) => (f.type === "test" || f.type === null ? total : total + f.additions),
    0,
  );
  return additions < SMALL_PR_THRESHOLD;
}

function isMetadataOnly(parsed: ParsedPath[]): boolean {
  return parsed.every((f) => METADATA_FILES.has(f.filename));
}

const RULES: { label: string; matches: (parsed: ParsedPath[]) => boolean }[] = [
  { label: "config-flow", matches: configFlow },
  { label: "has-tests", matches: hasTests },
  { label: "core", matches: touchesCore },
  { label: "new-integration", matches: addsNewIntegration },
  { label: "new-platform", matches: addsPlatform },
  { label: "remove-platform", matches: removesPlatform },
  { label: "small-pr", matches: isSmall },
  { label: "metadata-only", matches: isMetadataOnly },
];

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  if (ctx.senderIsBot) return undefined;

  const files = await ctx.target.files();
  const parsed = files.map((f) => new ParsedPath(f));
  const current = new Set(await ctx.target.labels());

  const toAdd: string[] = [];
  const toRemove: string[] = [];
  for (const { label, matches } of RULES) {
    if (matches(parsed)) {
      toAdd.push(label);
    } else if (current.has(label)) {
      toRemove.push(label);
    }
  }

  const effects: Effect[] = [];
  if (toAdd.length > 0) effects.push({ type: "addLabels", labels: toAdd });
  if (toRemove.length > 0) effects.push({ type: "removeLabels", label: toRemove });
  return effects.length > 0 ? effects : undefined;
}

export const fileShape: Rule = {
  name: "file-shape",
  description:
    "Labels PRs based on the shape of their changed files (`config-flow`, " +
    "`has-tests`, `core`, `new-platform`, `remove-platform`, `small-pr`, " +
    "`metadata-only`) and removes any of those labels that no longer apply.",
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_EDITED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
