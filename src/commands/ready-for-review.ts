import type { Command } from "../engine/types.js";

export const readyForReview: Command = {
  name: "ready-for-review",
  description: "Removes the draft status from the pull request.",
  scope: "pull_request",
  permission: "code_owner",

  async handle() {
    return [{ type: "markReadyForReview" }];
  },
};
