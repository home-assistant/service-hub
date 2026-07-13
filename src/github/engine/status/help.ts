/**
 * Who may invoke a command; the engine's dispatcher enforces it. Defined here
 * (not in engine/types.ts) so the status module renders help without
 * depending on the engine.
 */
export type CommandPermission = "none" | "author" | "code_owner";

/**
 * The command facts the status comment renders — the engine's `Command`
 * minus its handler, so no behavior crosses into this module.
 */
export interface CommandHelpEntry {
  name: string;
  description: string;
  permission: CommandPermission;
  /**
   * Sample invocation without the `/<slug> ` prefix (e.g. `rename "A better
   * title"`), shown in rendered command help for arg-taking commands.
   */
  example?: string;
  scope?: "pull_request" | "issue" | "both";
}

/** Broadest audience first: everyone → author → code owners. */
const PERMISSION_RANK: Record<CommandPermission, number> = {
  none: 0,
  author: 1,
  code_owner: 2,
};

// Org members can invoke everything and need no reminding — the notes only
// name the non-member audience each command is really for.
const PERMISSION_NOTES: Record<CommandPermission, string> = {
  none: "",
  author: " *(author)*",
  code_owner: " *(code owners)*",
};

/**
 * One markdown bullet per command — description, permission note, and a
 * sample invocation for arg-taking commands — sorted by audience breadth.
 */
export function commandHelpLines(slug: string, commands: readonly CommandHelpEntry[]): string[] {
  return [...commands]
    .sort((a, b) => PERMISSION_RANK[a.permission] - PERMISSION_RANK[b.permission])
    .map((c) => {
      const example = c.example ? ` — e.g. \`/${slug} ${c.example}\`` : "";
      return `- \`${c.name}\` — ${c.description}${PERMISSION_NOTES[c.permission]}${example}`;
    });
}

/** The commands available on the given target kind. */
export function commandsForTarget<T extends CommandHelpEntry>(
  commands: readonly T[],
  target: "pull_request" | "issue",
): T[] {
  return commands.filter((c) => (c.scope ?? "both") === "both" || c.scope === target);
}
