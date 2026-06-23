import { evaluatePR } from "../engine/evaluate.js";
import { config } from "../manifests/index.js";
import type { Command } from "./types.js";

export const updateCommand: Command = {
  name: "update",

  async handle(context) {
    await evaluatePR(
      config,
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
