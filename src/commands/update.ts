import { prConfig } from "../rules-pr/registry.js";
import { evaluatePR } from "../utils/evaluate.js";
import type { Command } from "./types.js";

export const updateCommand: Command = {
  name: "update",
  pattern: /^@ha-bot\s+update\s*$/im,

  async handle(context) {
    await evaluatePR(prConfig, context.github, context.db, {
      owner: context.owner,
      repo: context.repo,
      pull_number: context.issueNumber,
    });
  },
};
