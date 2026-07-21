import type { Command } from "../engine/types.js";

export const rename: Command = {
  name: "rename",
  description: 'Renames the issue or pull request: `rename "<new title>"`.',
  args: "required",
  example: 'rename "A more descriptive title"',
  permission: "code_owner",

  async handle(context) {
    if (context.args.length !== 1) throw new Error('usage: rename "<new title>"');
    return [{ type: "setTitle", title: context.args[0] }];
  },
};
