import { EventType } from "../engine/event.js";
import { matchCodeOwners, parseCodeOwners } from "../engine/model/codeowners.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import { commandsForTarget, commandViews } from "../engine/status/help.js";
import { loadTemplate, renderTemplate } from "../engine/status/template.js";
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
export const MENTION_MARKER = "<!-- ha-bot-mention -->";

// Layout and prose live in the template; this rule only builds the view.
// The marker is written literally there but grepped for here — fail at load
// if a template edit breaks the pair (one-ping detection depends on it).
const MENTION_TEMPLATE = loadTemplate("code-owner-mention");
if (!MENTION_TEMPLATE.includes(MENTION_MARKER)) {
  throw new Error("code-owner-mention template lost its marker comment");
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
  const codeownersLine = `https://github.com/${ctx.repo.fullName}/blob/HEAD/CODEOWNERS#L${match.line}`;

  const ownersMinusAuthor = owners.filter((usr) => usr !== authorLogin);

  const effects: Effect[] = [];
  if (ownersMinusAuthor.length > 0) {
    effects.push({ type: "addAssignees", assignees: ownersMinusAuthor });
  }

  const mentions = ownersMinusAuthor
    .filter((usr) => !assignees.includes(usr) && !commenters.includes(usr))
    .map((usr) => `@${usr}`);

  if (mentions.length > 0) {
    const applicable = commandsForTarget(ctx.commands, ctx.target.kind);
    effects.push({
      type: "comment",
      body: renderTemplate(MENTION_TEMPLATE, {
        mentions: mentions.join(", "),
        itemLabel,
        integrationName,
        codeownersLine,
        commandSlug: ctx.env.COMMAND_SLUG,
        hasCommands: applicable.length > 0,
        commands: commandViews(ctx.env.COMMAND_SLUG, applicable),
      }),
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
    // Never mention or assign on closed items — label events and ON_DEMAND fire on them too.
    if ((await ctx.target.state()) !== "open") return;

    const integrationNames = await config.domains(ctx);
    if (integrationNames.length === 0) return;

    // The rule is only registered on repos that have a CODEOWNERS file, so a
    // missing one is a misconfiguration — surface it instead of no-opping.
    const codeownersContent = await ctx.codeownersContent();
    if (!codeownersContent) {
      throw new Error(`No CODEOWNERS file in ${ctx.repo.fullName}`);
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
