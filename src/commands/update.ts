import { evaluateIssue, evaluatePR } from "../engine/evaluate.js";
import { config } from "../manifests/index.js";
import type { Command } from "./types.js";

export const updateCommand: Command = {
  name: "update",

  async handle(context) {
    const params = { owner: context.owner, repo: context.repo };
    const options = { botSlug: context.botSlug };
    if (context.isPullRequest) {
      await evaluatePR(
        config,
        context.github,
        { ...params, pull_number: context.issueNumber },
        options,
      );
    } else {
      await evaluateIssue(
        config,
        context.github,
        { ...params, issue_number: context.issueNumber },
        options,
      );
    }
  },
};
