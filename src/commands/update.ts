import { evaluateIssue, evaluatePR } from "../engine/evaluate.js";
import { config } from "../manifests/index.js";
import type { Command } from "./types.js";

export const updateCommand: Command = {
  name: "update",

  async handle(context) {
    const ref = { owner: context.owner, repo: context.repo, number: context.issueNumber };
    const options = { botSlug: context.botSlug };
    if (context.isPullRequest) {
      await evaluatePR(config, context.github, ref, options);
    } else {
      await evaluateIssue(config, context.github, ref, options);
    }
  },
};
