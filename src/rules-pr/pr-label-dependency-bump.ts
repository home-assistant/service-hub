import { EventType } from "../github/types.js";
import type { Rule } from "../rules/types.js";

const DEPENDENCY_FILES = new Set([
  "package_constraints.txt",
  "requirements_all.txt",
  "requirements_docs.txt",
  "requirements_test.txt",
  "requirements_test_all.txt",
]);

export const prLabelDependencyBump: Rule = {
  name: "pr-label-dependency-bump",
  description: "Labels PRs that only modify dependency files",
  allowBots: false,
  events: {
    [EventType.PULL_REQUEST_OPENED]: async (ctx) => {
      const files = await ctx.fetchPRFiles();
      const filenames = files.map((f) => f.filename.split("/").pop() ?? "");
      if (filenames.length > 0 && filenames.every((name) => DEPENDENCY_FILES.has(name))) {
        return [{ type: "addLabels", labels: ["dependency-bump"] }];
      }
    },
  },
};
