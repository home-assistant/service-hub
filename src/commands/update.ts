import { prConfig } from "../rules-pr/registry.js";
import { evaluatePR } from "../utils/evaluate.js";
import type { Command } from "./types.js";

export const updateCommand: Command = {
  name: "update",

  async handle(context) {
    await evaluatePR(
      prConfig,
      context.github,
      {
        owner: context.owner,
        repo: context.repo,
        pull_number: context.issueNumber,
      },
      { botSlug: context.botSlug },
    );
  },
};
