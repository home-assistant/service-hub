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

/** One template bullet per command, pre-assembled for the mustache views. */
export interface CommandHelpView {
  name: string;
  description: string;
  /** "" or " *(author)*" / " *(code owners)*". */
  permissionNote: string;
  /** "" or " — e.g. `/<slug> <example>`" for arg-taking commands. */
  exampleSuffix: string;
}

/**
 * View-model bullets for the command help blocks in the templates — sorted
 * by audience breadth. The bullet's markdown shape lives in the .md files.
 */
export function commandViews(
  slug: string,
  commands: readonly CommandHelpEntry[],
): CommandHelpView[] {
  return [...commands]
    .sort((a, b) => PERMISSION_RANK[a.permission] - PERMISSION_RANK[b.permission])
    .map((c) => ({
      name: c.name,
      description: c.description,
      permissionNote: PERMISSION_NOTES[c.permission],
      exampleSuffix: c.example ? ` — e.g. \`/${slug} ${c.example}\`` : "",
    }));
}

/** The commands available on the given target kind. */
export function commandsForTarget<T extends CommandHelpEntry>(
  commands: readonly T[],
  target: "pull_request" | "issue",
): T[] {
  return commands.filter((c) => (c.scope ?? "both") === "both" || c.scope === target);
}
