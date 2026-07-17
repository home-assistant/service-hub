import { EventType } from "../engine/event.js";
import { matchCodeOwners, parseCodeOwners } from "../engine/model/codeowners.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import { commandHelpLines, commandsForTarget } from "../engine/status/help.js";
import type { Effect, Rule } from "../engine/types.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_LABELED
  | EventType.ISSUES_OPENED
  | EventType.ISSUES_LABELED
  | EventType.ON_DEMAND;

// One ping per item: a comment carrying this marker means owners were already
// mentioned, and no further mention comments are posted — even if new
// integrations or code owners show up later. Assignment can fail silently
// (owners without repo access), so comment presence is the only reliable state.
export const MENTION_MARKER = "<!-- ha-bot:code-owner-mention -->";

/**
 * Compact help block listing the commands a code owner may use on this item,
 * from the repo's registered command list on the context.
 */
function commandHelp(ctx: RuleContext<HandledEvent>): string {
  const available = commandsForTarget(ctx.commands, ctx.target.kind);
  if (available.length === 0) return "";

  return [
    "",
    "<details><summary>Code owner commands</summary>",
    "",
    `Reply with \`/${ctx.env.COMMAND_SLUG} <command>\`:`,
    "",
    ...commandHelpLines(ctx.env.COMMAND_SLUG, available),
    "",
    "</details>",
  ].join("\n");
}

function processIntegration(
  ctx: RuleContext<HandledEvent>,
  integrationName: string,
  codeownersContent: string,
  pathPattern: (name: string) => string,
  itemLabel: string,
  authorLogin: string,
  assignees: string[],
  commenters: string[],
): Effect[] {
  if (!codeownersContent.includes(integrationName)) return [];

  const entries = parseCodeOwners(codeownersContent);
  const match = matchCodeOwners(pathPattern(integrationName), entries);
  if (!match) return [];

  const owners = match.owners.map((o) => o.substring(1).toLowerCase());
  const codeownersLine = `https://github.com/${ctx.repository}/blob/HEAD/CODEOWNERS#L${match.line}`;

  const ownersMinusAuthor = owners.filter((usr) => usr !== authorLogin);

  const effects: Effect[] = [];
  if (ownersMinusAuthor.length > 0) {
    effects.push({ type: "addAssignees", assignees: ownersMinusAuthor });
  }

  const mentions = ownersMinusAuthor
    .filter((usr) => !assignees.includes(usr) && !commenters.includes(usr))
    .map((usr) => `@${usr}`);

  if (mentions.length > 0) {
    effects.push({
      type: "comment",
      body:
        `${MENTION_MARKER}\n\nHey there ${mentions.join(", ")}, mind taking a look at this ${itemLabel} as it has been labeled with an integration (\`${integrationName}\`) you are listed as a [code owner](${codeownersLine}) for? Thanks!` +
        commandHelp(ctx),
    });
  }

  return effects;
}

export function mentionCodeOwners(config: {
  pathPattern: (integration: string) => string;
  /**
   * Integration domains the item is about — repo policy (file layout, doc
   * links), injected by the manifest. Returning [] skips the rule, including
   * for label events the implementation deems irrelevant.
   */
  domains: (ctx: RuleContext<EventType>) => Promise<string[]>;
  itemLabel?: string;
}): Rule {
  async function handle(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
    const integrationNames = await config.domains(ctx);
    if (integrationNames.length === 0) return;

    // The rule is only registered on repos that have a CODEOWNERS file, so a
    // missing one is a misconfiguration — surface it instead of no-opping.
    const codeownersContent = await ctx.repo.codeownersContent();
    if (!codeownersContent) {
      throw new Error(`No CODEOWNERS file in ${ctx.repository}`);
    }

    const comments = await ctx.target.issueComments();
    if (comments.some((c) => c.body?.includes(MENTION_MARKER))) return;

    const authorLogin = (await ctx.target.authorLogin()).toLowerCase();
    const assignees = (await ctx.target.assigneeLogins()).map((a) => a.toLowerCase());
    const commenters = comments.map((c) => c.user?.login?.toLowerCase() ?? "");

    const itemLabel = config.itemLabel ?? (ctx.target.kind === "issue" ? "issue" : "pull request");

    const effects: Effect[] = [];
    for (const integrationName of integrationNames) {
      effects.push(
        ...processIntegration(
          ctx,
          integrationName,
          codeownersContent,
          config.pathPattern,
          itemLabel,
          authorLogin,
          assignees,
          commenters,
        ),
      );
    }

    return effects.length > 0 ? effects : undefined;
  }

  return {
    name: "code-owner-mention",
    description: "Assigns and mentions code owners for integrations a PR/issue touches",
    events: on(
      [
        EventType.PULL_REQUEST_OPENED,
        EventType.PULL_REQUEST_EDITED,
        EventType.PULL_REQUEST_SYNCHRONIZE,
        EventType.PULL_REQUEST_LABELED,
        EventType.ISSUES_OPENED,
        EventType.ISSUES_LABELED,
        EventType.ON_DEMAND,
      ],
      handle,
    ),
  };
}
