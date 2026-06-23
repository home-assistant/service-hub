import type { WebhookContext } from "../engine/context.js";
import type { Effect, EventPayloadMap, Rule } from "../engine/types.js";
import { matchCodeOwners, parseCodeOwners } from "../github/codeowners.js";
import { expandOrganizationTeams } from "../github/teams.js";
import { EventType } from "../github/types.js";

type HandledEvent =
  | EventType.ISSUES_LABELED
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function fetchCodeowners(
  ctx: WebhookContext<EventPayloadMap[HandledEvent]>,
): Promise<string | null> {
  try {
    const { data } = await ctx.github.repos.getContent(ctx.repo({ path: "CODEOWNERS" }));
    if (!("content" in data)) return null;
    return new TextDecoder().decode(Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0)));
  } catch (err) {
    console.warn(`mentionCodeOwners: CODEOWNERS fetch for ${ctx.repository} failed:`, err);
    return null;
  }
}

interface TriggerItem {
  user?: { login: string } | null;
  assignees?: ({ login: string } | null)[] | null;
}

async function processIntegration(
  ctx: WebhookContext<EventPayloadMap[HandledEvent]>,
  integrationName: string,
  codeownersContent: string,
  pathPattern: (name: string) => string,
  itemLabel: string,
  triggerItem: TriggerItem,
  commenters: string[],
): Promise<Effect[]> {
  if (!codeownersContent.includes(integrationName)) return [];

  const entries = parseCodeOwners(codeownersContent);
  const match = matchCodeOwners(pathPattern(integrationName), entries);
  if (!match) return [];

  const owners = match.owners.map((o) => o.substring(1).toLowerCase());
  const codeownersLine = `https://github.com/${ctx.repository}/blob/HEAD/CODEOWNERS#L${match.line}`;

  const authorLogin = (triggerItem.user?.login ?? "").toLowerCase();
  const assignees =
    triggerItem.assignees?.flatMap((a) => (a?.login ? [a.login.toLowerCase()] : [])) ?? [];
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

  const expandedOwners = await expandOrganizationTeams(ctx.github, ctx.organization, owners);
  if (expandedOwners.includes(authorLogin)) {
    effects.push({ type: "addLabels", labels: ["by-code-owner"] });
  }

  return effects;
}

function labelsToIntegrationNames(labels: { name?: string }[] | null | undefined): string[] {
  return (labels ?? []).flatMap((l) =>
    l?.name?.startsWith("integration: ") ? [l.name.slice("integration: ".length)] : [],
  );
}

async function collectIntegrationNames(
  ctx: WebhookContext<EventPayloadMap[HandledEvent]>,
  triggerItem: TriggerItem & { labels?: { name?: string }[] | null },
): Promise<string[]> {
  switch (ctx.eventType) {
    case EventType.ISSUES_LABELED:
    case EventType.PULL_REQUEST_LABELED: {
      const labeled = ctx.payload as EventPayloadMap[
        | EventType.ISSUES_LABELED
        | EventType.PULL_REQUEST_LABELED];
      if (!labeled.label?.name.startsWith("integration: ")) return [];
      return [labeled.label.name.slice("integration: ".length)];
    }
    case EventType.PULL_REQUEST_OPENED:
    case EventType.PULL_REQUEST_REOPENED:
    case EventType.PULL_REQUEST_SYNCHRONIZE:
      return ctx.getIntegrationDomains();
    case EventType.ON_DEMAND: {
      const fileDerived = await ctx.getIntegrationDomains();
      const labelDerived = labelsToIntegrationNames(triggerItem.labels);
      return [...new Set([...fileDerived, ...labelDerived])];
    }
    default:
      return [];
  }
}

export function mentionCodeOwners(config: {
  pathPattern: (integration: string) => string;
  itemLabel?: string;
}): Rule {
  async function handle(
    ctx: WebhookContext<EventPayloadMap[HandledEvent]>,
  ): Promise<Effect[] | undefined> {
    const payload = ctx.payload;

    // The "trigger item" is the issue or pull_request the event is about.
    const triggerItem =
      "pull_request" in payload ? payload.pull_request : "issue" in payload ? payload.issue : null;
    if (!triggerItem) return;

    // Pick which integration domain(s) drive this dispatch:
    //   LABELED → only the integration in the just-added label (if any)
    //   PR opened/reopened/synchronize → derived from changed files
    //   ON_DEMAND → union of file-derived (PR only) and label-derived
    const integrationNames = await collectIntegrationNames(ctx, triggerItem);
    if (integrationNames.length === 0) return;

    const codeownersContent = await fetchCodeowners(ctx);
    if (!codeownersContent) return;

    const commentsData = await ctx.github.issues.listComments(ctx.issue({ per_page: 100 }));
    const commenters = commentsData.data.map((c) => c.user?.login?.toLowerCase() ?? "");

    const itemLabel =
      config.itemLabel ?? (ctx.eventType.startsWith("issues") ? "issue" : "pull request");

    const effects: Effect[] = [];
    for (const integrationName of integrationNames) {
      const integrationEffects = await processIntegration(
        ctx,
        integrationName,
        codeownersContent,
        config.pathPattern,
        itemLabel,
        triggerItem,
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
