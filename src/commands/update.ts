import { evaluatePR } from "../refresh/evaluate.js";
import { config } from "../rules/registry.js";
import type { Command } from "./types.js";

export const updateCommand: Command = {
  name: "update",
  pattern: /^@ha-bot\s+update\s*$/im,

  async handle(context) {
    await evaluatePR(config, context.github, context.db, {
      owner: context.owner,
      repo: context.repo,
      pull_number: context.issueNumber,
    });
  },
};
