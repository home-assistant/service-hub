import type { Command } from "../engine/types.js";

export const reopen: Command = {
  name: "reopen",
  description: "Reopens the issue or pull request.",
  permission: "code_owner",

  async handle() {
    return [{ type: "setState", state: "open" }];
  },
};
