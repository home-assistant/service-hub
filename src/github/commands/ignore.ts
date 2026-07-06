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
  description: "Waives a dashboard check: `ignore <section-id> <reason>`.",
  args: "required",
  example: "ignore merge-conflict Will rebase before merging",
  scope: "pull_request",
  permission: "author",

  async handle(context) {
    const args = (context.args ?? "").trim();
    const spaceIndex = args.search(/\s/);
    const id = spaceIndex === -1 ? args : args.slice(0, spaceIndex);
    const reason = spaceIndex === -1 ? "" : args.slice(spaceIndex + 1).trim();
    if (!id || !reason) throw new Error("usage: ignore <section-id> <reason>");

    const knownIds = new Set(
      (context.registry.repositories[context.repository] ?? []).flatMap(
        (rule) => rule.dashboardSections ?? [],
      ),
    );
    if (!knownIds.has(id)) throw new Error(`unknown dashboard section "${id}"`);

    const tag = `<!-- ha-bot:ignore id="${id}" reason="${reason.replaceAll('"', "'")}" -->`;
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
