import type { Command } from "../engine/types.js";

export const updateBranch: Command = {
  name: "update-branch",
  description: "Updates the pull request branch with the base branch.",
  scope: "pull_request",
  permission: "code_owner",

  async handle() {
    return [{ type: "updateBranch" }];
  },
};
