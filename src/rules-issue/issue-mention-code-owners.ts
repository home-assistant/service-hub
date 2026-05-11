import type { IssuesLabeledEvent, PullRequestLabeledEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, Rule } from "../rules/types.js";
import { matchCodeOwners, parseCodeOwners } from "../utils/codeowners.js";
import { expandOrganizationTeams } from "../utils/organization-teams.js";

export function mentionCodeOwners(config: {
  pathPattern: (integration: string) => string;
  itemLabel?: string;
}): Rule {
  async function handle(
    ctx: WebhookContext<IssuesLabeledEvent | PullRequestLabeledEvent>,
  ): Promise<Effect[] | undefined> {
    const payload = ctx.payload;

    if (!payload.label?.name.startsWith("integration: ")) return;

    const integrationName = payload.label.name.split("integration: ")[1];
    const path = config.pathPattern(integrationName);

    let codeownersContent: string;
    try {
      const { data } = await ctx.github.repos.getContent(ctx.repo({ path: "CODEOWNERS" }));
      if (!("content" in data)) return;
      codeownersContent = new TextDecoder().decode(
        Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0)),
      );
    } catch (err) {
      console.warn(`mentionCodeOwners: CODEOWNERS fetch for ${ctx.repository} failed:`, err);
      return;
    }

    if (!codeownersContent.includes(integrationName)) return;

    const entries = parseCodeOwners(codeownersContent);
    const match = matchCodeOwners(path, entries);
    if (!match) return;

    const owners = match.owners.map((o) => o.substring(1).toLowerCase());
    const codeownersLine = `https://github.com/${ctx.repository}/blob/HEAD/CODEOWNERS#L${match.line}`;

    const triggerItem =
      "pull_request" in payload ? payload.pull_request : "issue" in payload ? payload.issue : null;
    if (!triggerItem) return;

    const payloadUsername = triggerItem.user.login.toLowerCase();
    const assignees = triggerItem.assignees.map((a) => a.login.toLowerCase());

    const commentsData = await ctx.github.issues.listComments(ctx.issue({ per_page: 100 }));
    const commenters = commentsData.data.map((c) => c.user?.login?.toLowerCase() ?? "");

    const ownersMinusAuthor = owners.filter((usr) => usr !== payloadUsername);

    const effects: Effect[] = [];
    if (ownersMinusAuthor.length > 0) {
      effects.push({ type: "addAssignees", assignees: ownersMinusAuthor });
    }

    const mentions = ownersMinusAuthor
      .filter((usr) => !assignees.includes(usr) && !commenters.includes(usr))
      .map((usr) => `@${usr}`);

    if (mentions.length > 0) {
      const triggerLabel =
        config.itemLabel ?? (ctx.eventType.startsWith("issues") ? "issue" : "pull request");
      effects.push({
        type: "comment",
        body: `Hey there ${mentions.join(", ")}, mind taking a look at this ${triggerLabel} as it has been labeled with an integration (\`${integrationName}\`) you are listed as a [code owner](${codeownersLine}) for? Thanks!`,
      });
    }

    const expandedOwners = await expandOrganizationTeams(ctx.github, ctx.organization, owners);
    if (expandedOwners.includes(payloadUsername)) {
      effects.push({ type: "addLabels", labels: ["by-code-owner"] });
    }

    return effects;
  }

  return {
    name: "mention-code-owners",
    description: "Assigns and mentions code owners when an integration label is added",
    events: {
      [EventType.ISSUES_LABELED]: handle,
      [EventType.PULL_REQUEST_LABELED]: handle,
    },
  };
}
