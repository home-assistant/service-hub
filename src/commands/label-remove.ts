import type { Command } from "../engine/types.js";

export function removeLabel(manageable: readonly string[]): Command {
  const valid = new Set(manageable);
  return {
    name: "remove-label",
    description: `Removes a label (${manageable.join(", ")}) from the issue or pull request.`,
    args: "required",
    example: `remove-label ${manageable[0]}`,
    permission: "code_owner",

    async handle(context) {
      const label = context.args ?? "";
      if (!valid.has(label)) {
        throw new Error(`Label "${label}" is not manageable via commands`);
      }
      if (!(await context.target.labels()).includes(label)) {
        throw new Error(`Label "${label}" is not set`);
      }
      return [{ type: "removeLabels", labels: [label] }];
    },
  };
}
