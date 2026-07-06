import type { Command } from "../engine/types.js";

export const rename: Command = {
  name: "rename",
  description: "Renames the issue or pull request.",
  args: "required",
  example: "rename A more descriptive title",
  permission: "code_owner",

  async handle(context) {
    return [{ type: "setTitle", title: context.args ?? "" }];
  },
};
