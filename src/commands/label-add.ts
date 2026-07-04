import type { Command } from "../engine/types.js";

export function addLabel(manageable: readonly string[]): Command {
  const valid = new Set(manageable);
  return {
    name: "add-label",
    description: `Adds a label (${manageable.join(", ")}) to the issue or pull request.`,
    args: "required",
    permission: "code_owner",

    async handle(context) {
      const label = context.args ?? "";
      if (!valid.has(label)) {
        throw new Error(`Label "${label}" is not manageable via commands`);
      }
      return [{ type: "addLabels", labels: [label] }];
    },
  };
}
