import type { Command } from "../engine/types.js";

export const markDraft: Command = {
  name: "mark-draft",
  description: "Marks the pull request as draft.",
  scope: "pull_request",
  permission: "code_owner",

  async handle() {
    return [{ type: "convertToDraft" }];
  },
};
