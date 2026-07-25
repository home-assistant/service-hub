import type { CommandContext } from "../engine/model/command-context.js";
import type { Command, Effect } from "../engine/types.js";

/**
 * Users see a check's title on the dashboard, not its section ID — resolve
 * the title against the registry's section claims.
 */
function resolveSectionId(context: CommandContext, title: string): string {
  const claims = (context.registry.repositories[context.repo.fullName] ?? []).flatMap(
    (rule) => rule.statusSections ?? [],
  );
  const claim = claims.find((c) => c.title.toLowerCase() === title.trim().toLowerCase());
  if (!claim) throw new Error(`unknown dashboard check "${title}"`);
  return claim.id;
}

/**
 * Waivers are `overrideSection` effects: the dispatcher's status sync merges
 * them into the section state persisted in the status comment, so they stick
 * across re-emissions of the section until an explicit `unignore`.
 */
export const ignore: Command = {
  name: "ignore",
  description: 'Waives a dashboard check: `ignore "<check name>" "<reason>"`.',
  args: "required",
  example: 'ignore "Merge conflicts" "Broken rule, no merge conflicts present"',
  scope: "pull_request",
  permission: "author",

  async handle(context): Promise<Effect[]> {
    if (context.args.length !== 2) throw new Error('usage: ignore "<check name>" "<reason>"');
    const [name, reason] = context.args;
    return [{ type: "overrideSection", id: resolveSectionId(context, name), ignore: { reason } }];
  },
};

export const unignore: Command = {
  name: "unignore",
  description: 'Restores a waived dashboard check: `unignore "<check name>"`.',
  args: "required",
  example: 'unignore "Merge conflicts"',
  scope: "pull_request",
  permission: "author",

  async handle(context): Promise<Effect[]> {
    if (context.args.length !== 1) throw new Error('usage: unignore "<check name>"');
    return [
      { type: "overrideSection", id: resolveSectionId(context, context.args[0]), ignore: null },
    ];
  },
};
