import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "./types.js";

const DEPENDENCY_FILES = new Set([
  "package_constraints.txt",
  "requirements_all.txt",
  "requirements_docs.txt",
  "requirements_test.txt",
  "requirements_test_all.txt",
]);

export const prLabelDependencyBump: Rule = {
  name: "pr-label-dependency-bump",
  allowBots: false,
  listens: [EventType.PULL_REQUEST_OPENED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const files = await context.fetchPRFiles();
    const filenames = files.map((f) => f.filename.split("/").pop() ?? "");

    if (filenames.length > 0 && filenames.every((name) => DEPENDENCY_FILES.has(name))) {
      return { labels: ["dependency-bump"] };
    }
  },
};
