import { EventType } from "../engine/event.js";
import { matchCodeOwners, parseCodeOwners } from "../engine/model/codeowners.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";

type HandledEvent =
  | EventType.ISSUES_LABELED
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

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
  // Pick which integration domain(s) drive this dispatch:
  //   LABELED → only the integration in the just-added label (if any)
  //   PR opened/reopened/synchronize → derived from changed files
  //   ON_DEMAND → union of file-derived and label-derived
  if ("label" in ctx.event) {
    if (!ctx.event.label.startsWith(INTEGRATION_LABEL_PREFIX)) return [];
    return [ctx.event.label.slice(INTEGRATION_LABEL_PREFIX.length)];
  }

  if (ctx.target.kind !== "pull_request") return [];
  const fileDerived = await ctx.target.integrationDomains();
  if (ctx.eventType !== EventType.ON_DEMAND) return fileDerived;

  const labelDerived = (await ctx.target.labels())
    .filter((l) => l.startsWith(INTEGRATION_LABEL_PREFIX))
    .map((l) => l.slice(INTEGRATION_LABEL_PREFIX.length));
  return [...new Set([...fileDerived, ...labelDerived])];
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
      [EventType.PULL_REQUEST_OPENED]: handle,
      [EventType.PULL_REQUEST_REOPENED]: handle,
      [EventType.PULL_REQUEST_SYNCHRONIZE]: handle,
      [EventType.ON_DEMAND]: handle,
    },
  };
}
