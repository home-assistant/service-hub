import { EventType } from "../engine/event.js";
import { matchCodeOwners, parseCodeOwners } from "../engine/model/codeowners.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";

type HandledEvent = EventType.ISSUES_LABELED | EventType.PULL_REQUEST_LABELED | EventType.ON_DEMAND;

const INTEGRATION_LABEL_PREFIX = "integration: ";

async function processIntegration(
  ctx: RuleContext<HandledEvent>,
  integrationName: string,
  codeownersContent: string,
  pathPattern: (name: string) => string,
  itemLabel: string,
  authorLogin: string,
  assignees: string[],
  commenters: string[],
): Promise<Effect[]> {
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
      body: `Hey there ${mentions.join(", ")}, mind taking a look at this ${itemLabel} as it has been labeled with an integration (\`${integrationName}\`) you are listed as a [code owner](${codeownersLine}) for? Thanks!`,
    });
  }

  const expandedOwners = await ctx.org.expandTeams(owners);
  if (expandedOwners.includes(authorLogin)) {
    effects.push({ type: "addLabels", labels: ["by-code-owner"] });
  }

  return effects;
}

async function collectIntegrationNames(ctx: RuleContext<HandledEvent>): Promise<string[]> {
  // State-based: the `integration:` labels currently on the item, whether
  // the trigger is a label event or on_demand. Re-processing an integration
  // is idempotent — owners already assigned or heard from aren't re-pinged.
  // A labeled/unlabeled event for a non-integration label can't change the
  // outcome, so skip those cheaply.
  if ("label" in ctx.event && !ctx.event.label.startsWith(INTEGRATION_LABEL_PREFIX)) return [];

  return (await ctx.target.labels())
    .filter((l) => l.startsWith(INTEGRATION_LABEL_PREFIX))
    .map((l) => l.slice(INTEGRATION_LABEL_PREFIX.length));
}

export function mentionCodeOwners(config: {
  pathPattern: (integration: string) => string;
  itemLabel?: string;
}): Rule {
  async function handle(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
    const integrationNames = await collectIntegrationNames(ctx);
    if (integrationNames.length === 0) return;

    const codeownersContent = await ctx.repo.codeownersContent();
    if (!codeownersContent) return;

    const authorLogin = (await ctx.target.authorLogin()).toLowerCase();
    const assignees = (await ctx.target.assigneeLogins()).map((a) => a.toLowerCase());
    const comments = await ctx.target.issueComments();
    const commenters = comments.map((c) => c.user?.login?.toLowerCase() ?? "");

    const itemLabel = config.itemLabel ?? (ctx.target.kind === "issue" ? "issue" : "pull request");

    const effects: Effect[] = [];
    for (const integrationName of integrationNames) {
      const integrationEffects = await processIntegration(
        ctx,
        integrationName,
        codeownersContent,
        config.pathPattern,
        itemLabel,
        authorLogin,
        assignees,
        commenters,
      );
      effects.push(...integrationEffects);
    }

    return effects.length > 0 ? effects : undefined;
  }

  return {
    name: "code-owner-mention",
    description: "Assigns and mentions code owners for integrations a PR/issue touches",
    events: {
      [EventType.ISSUES_LABELED]: handle,
      [EventType.PULL_REQUEST_LABELED]: handle,
      [EventType.ON_DEMAND]: handle,
    },
  };
}
