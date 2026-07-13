import { evaluateIssue, evaluatePR } from "../engine/evaluate.js";
import type { Command } from "../engine/types.js";

export const update: Command = {
  name: "update",
  description: "Re-runs the bot's checks on the issue or pull request.",
  permission: "none",

  async handle(context) {
    const ref = { owner: context.repo.owner, repo: context.repo.name, number: context.number };
    if (context.target.kind === "pull_request") {
      await evaluatePR(context.github, ref, context.env, context.registry);
    } else {
      await evaluateIssue(context.github, ref, context.env, context.registry);
    }
    return undefined;
  },
};
