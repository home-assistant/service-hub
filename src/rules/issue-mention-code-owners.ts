import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository } from "../github/types.js";
import { matchCodeOwners, parseCodeOwners } from "../utils/codeowners.js";
import { expandOrganizationTeams } from "../utils/organization-teams.js";
import type { Rule, RuleResult } from "./types.js";

export const issueMentionCodeOwners: Rule = {
  name: "issue-mention-code-owners",
  listens: [EventType.ISSUES_LABELED, EventType.PULL_REQUEST_LABELED],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as unknown as {
      label?: { name: string };
      issue?: { user: { login: string }; assignees: { login: string }[] };
      pull_request?: { user: { login: string }; assignees: { login: string }[] };
    };

    if (!payload.label?.name.startsWith("integration: ")) return;

    const integrationName = payload.label.name.split("integration: ")[1];
    const path =
      context.repository === HomeAssistantRepository.CORE
        ? `homeassistant/components/${integrationName}/*`
        : `source/_integrations/${integrationName}.markdown`;

    // Fetch CODEOWNERS
    let codeownersContent: string;
    try {
      const { data } = await context.github.repos.getContent(context.repo({ path: "CODEOWNERS" }));
      if (!("content" in data)) return;
      codeownersContent = atob(data.content);
    } catch {
      return;
    }

    if (!codeownersContent.includes(integrationName)) return;

    const entries = parseCodeOwners(codeownersContent);
    const match = matchCodeOwners(path, entries);
    if (!match) return;

    const owners = match.owners.map((o) => o.substring(1).toLowerCase());
    const codeownersLine = `https://github.com/${context.repository}/blob/HEAD/CODEOWNERS#L${match.line}`;

    const triggerItem = payload.pull_request ?? payload.issue;
    if (!triggerItem) return;

    const payloadUsername = triggerItem.user.login.toLowerCase();
    const assignees = triggerItem.assignees.map((a) => a.login.toLowerCase());

    // Get existing commenters
    const commentsData = await context.github.issues.listComments(context.issue({ per_page: 100 }));
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
        context.repository === HomeAssistantRepository.CORE
          ? context.eventType.startsWith("issues")
            ? "issue"
            : "pull request"
          : "feedback";

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
