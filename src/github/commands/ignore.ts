import { log } from "../../log.js";
import { evaluatePR } from "../engine/evaluate.js";
import type { Command } from "../engine/types.js";

/**
 * Comment-command form of the `<!-- ha-bot:ignore -->` PR-description tag:
 * appends the tag to the PR body and re-evaluates so the dashboard reflects
 * the waived check immediately. The tag keeps the body as the single source
 * of truth for overrides — removing it from the description un-waives.
 */
export const ignore: Command = {
  name: "ignore",
  description: 'Waives a dashboard check: `ignore "<check name>" "<reason>"`.',
  args: "required",
  example: 'ignore "Merge conflicts" "Broken rule, no merge conflicts present"',
  scope: "pull_request",
  permission: "author",

  async handle(context) {
    if (context.args.length !== 2) throw new Error('usage: ignore "<check name>" "<reason>"');
    const [name, reason] = context.args;

    // Users see a check's title on the dashboard, not its section ID —
    // resolve the title against the registry's section claims.
    const claims = (context.registry.repositories[context.repository] ?? []).flatMap(
      (rule) => rule.dashboardSections ?? [],
    );
    const claim = claims.find((c) => c.title.toLowerCase() === name.trim().toLowerCase());
    if (!claim) throw new Error(`unknown dashboard check "${name}"`);

    const tag = `<!-- ha-bot:ignore id="${claim.id}" reason="${reason}" -->`;
    if (context.dryRun) {
      log.info("dry run", { repository: context.repository, ignoreTag: tag });
      return undefined;
    }

    const body = (await context.target.body()) ?? "";
    await context.github.issues.update(context.issueParams({ body: `${body}\n\n${tag}` }));
    await evaluatePR(
      context.registry,
      context.github,
      { owner: context.repo.owner, repo: context.repo.name, number: context.number },
      { botSlug: context.botSlug, commandSlug: context.commandSlug, dryRun: context.dryRun },
    );
    return undefined;
  },
};
