import type { IssuesLabeledEvent, PullRequestLabeledEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";
import { matchCodeOwners, parseCodeOwners } from "../utils/codeowners.js";
import { expandOrganizationTeams } from "../utils/organization-teams.js";

export function mentionCodeOwners(config: {
  pathPattern: (integration: string) => string;
  itemLabel?: string;
}): Rule {
  return {
    name: "mention-code-owners",
    description: "Assigns and mentions code owners when an integration label is added",
    listens: [EventType.ISSUES_LABELED, EventType.PULL_REQUEST_LABELED],

    async handle(context: WebhookContext): Promise<RuleResult | undefined> {
      const payload = context.payload as IssuesLabeledEvent | PullRequestLabeledEvent;

      if (!payload.label?.name.startsWith("integration: ")) return;

      const integrationName = payload.label.name.split("integration: ")[1];
      const path = config.pathPattern(integrationName);

      // Fetch CODEOWNERS
      let codeownersContent: string;
      try {
        const { data } = await context.github.repos.getContent(
          context.repo({ path: "CODEOWNERS" }),
        );
        if (!("content" in data)) return;
        codeownersContent = new TextDecoder().decode(
          Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0)),
        );
      } catch (err) {
        console.warn(`mentionCodeOwners: CODEOWNERS fetch for ${context.repository} failed:`, err);
        return;
      }

      if (!codeownersContent.includes(integrationName)) return;

      const entries = parseCodeOwners(codeownersContent);
      const match = matchCodeOwners(path, entries);
      if (!match) return;

      const owners = match.owners.map((o) => o.substring(1).toLowerCase());
      const codeownersLine = `https://github.com/${context.repository}/blob/HEAD/CODEOWNERS#L${match.line}`;

      const triggerItem =
        "pull_request" in payload
          ? payload.pull_request
          : "issue" in payload
            ? payload.issue
            : null;
      if (!triggerItem) return;

      const payloadUsername = triggerItem.user.login.toLowerCase();
      const assignees = triggerItem.assignees.map((a) => a.login.toLowerCase());

      // Get existing commenters
      const commentsData = await context.github.issues.listComments(
        context.issue({ per_page: 100 }),
      );
      const commenters = commentsData.data.map((c) => c.user?.login?.toLowerCase() ?? "");

      const ownersMinusAuthor = owners.filter((usr) => usr !== payloadUsername);

      const result: RuleResult = {
        assignees: ownersMinusAuthor,
      };

      const mentions = ownersMinusAuthor
        .filter((usr) => !assignees.includes(usr) && !commenters.includes(usr))
        .map((usr) => `@${usr}`);

      if (mentions.length > 0) {
        const triggerLabel =
          config.itemLabel ?? (context.eventType.startsWith("issues") ? "issue" : "pull request");

        result.comment = `Hey there ${mentions.join(", ")}, mind taking a look at this ${triggerLabel} as it has been labeled with an integration (\`${integrationName}\`) you are listed as a [code owner](${codeownersLine}) for? Thanks!`;
      }

      // Check if author is a code owner
      const expandedOwners = await expandOrganizationTeams(
        context.github,
        context.organization,
        owners,
      );
      if (expandedOwners.includes(payloadUsername)) {
        result.labels = [...(result.labels ?? []), "by-code-owner"];
      }

      return result;
    },
  };
}
