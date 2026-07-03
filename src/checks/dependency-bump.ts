import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";
import { EventType } from "../github/types.js";

const DEPENDENCY_FILES = new Set([
  "package_constraints.txt",
  "requirements_all.txt",
  "requirements_docs.txt",
  "requirements_test.txt",
  "requirements_test_all.txt",
]);

type HandledEvent = EventType.PULL_REQUEST_OPENED | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  const files = await ctx.target.files();
  const filenames = files.map((f) => f.filename.split("/").pop() ?? "");
  if (filenames.length > 0 && filenames.every((name) => DEPENDENCY_FILES.has(name))) {
    return [{ type: "addLabels", labels: ["dependency-bump"] }];
  }
}

export const dependencyBump: Rule = {
  name: "dependency-bump",
  description: "Labels PRs that only modify dependency files",
  allowBots: false,
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
