import type { Command, CommandPermission } from "./types.js";

/** Broadest audience first: everyone → author → members → code owners. */
const PERMISSION_RANK: Record<CommandPermission, number> = {
  none: 0,
  author: 1,
  member: 2,
  code_owner: 3,
};

const PERMISSION_NOTES: Record<CommandPermission, string> = {
  none: "",
  author: " *(author or members)*",
  member: " *(members)*",
  code_owner: " *(code owners)*",
};

/**
 * One markdown bullet per command — description, permission note, and a
 * sample invocation for arg-taking commands — sorted by audience breadth.
 */
export function commandHelpLines(slug: string, commands: readonly Command[]): string[] {
  return [...commands]
    .sort((a, b) => PERMISSION_RANK[a.permission] - PERMISSION_RANK[b.permission])
    .map((c) => {
      const example = c.example ? ` — e.g. \`/${slug} ${c.example}\`` : "";
      return `- \`${c.name}\` — ${c.description}${PERMISSION_NOTES[c.permission]}${example}`;
    });
}

/** The commands available on the given target kind. */
export function commandsForTarget(
  commands: readonly Command[],
  target: "pull_request" | "issue",
): Command[] {
  return commands.filter((c) => (c.scope ?? "both") === "both" || c.scope === target);
}
