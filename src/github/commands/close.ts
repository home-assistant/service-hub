import type { Command } from "../engine/types.js";

export const close: Command = {
  name: "close",
  description: "Closes the issue or pull request.",
  permission: "code_owner",

  async handle() {
    return [{ type: "setState", state: "closed" }];
  },
};
