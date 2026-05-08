import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository, Organization } from "../github/types.js";
import {
  extractIssuesOrPullRequestMarkdownLinks,
  extractPullRequestURLLinks,
} from "../utils/text-parser.js";
import type { Rule, RuleResult } from "./types.js";

export const prDocsParenting: Rule = {
  name: "pr-docs-parenting",
  listens: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_CLOSED,
    EventType.PULL_REQUEST_EDITED,
  ],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as unknown as {
      action: string;
      pull_request: {
        body: string | null;
        state: string;
        merged: boolean;
      };
    };

    if (
      context.eventType === EventType.PULL_REQUEST_REOPENED ||
      context.eventType === EventType.PULL_REQUEST_CLOSED
    ) {
      // Sync parent/child state — needs direct API calls
      return { actions: [async (ctx) => updateDocsParentStatus(ctx, payload)] };
    }

    // opened or edited
    if (context.repository === HomeAssistantRepository.HOME_ASSISTANT_IO) {
      return handleDocsRepo(context, payload);
    }
    return handleCodeRepo(context, payload);
  },
};

function handleCodeRepo(
  _context: WebhookContext,
  payload: { pull_request: { body: string | null } },
): RuleResult | undefined {
  const linksToDocs = [
    ...extractIssuesOrPullRequestMarkdownLinks(payload.pull_request.body),
    ...extractPullRequestURLLinks(payload.pull_request.body),
  ].filter((link) => `${link.owner}/${link.repo}` === HomeAssistantRepository.HOME_ASSISTANT_IO);

  if (linksToDocs.length === 0 || linksToDocs.length > 2) return;

  // Label the docs PRs as having a parent
  return {
    actions: [
      async (ctx) => {
        for (const link of linksToDocs) {
          await ctx.github.issues.addLabels({
            owner: link.owner,
            repo: link.repo,
            issue_number: link.number,
            labels: ["has-parent"],
          });
        }
      },
    ],
  };
}

function handleDocsRepo(
  _context: WebhookContext,
  payload: { pull_request: { body: string | null } },
): RuleResult | undefined {
  const linksToCode = [
    ...extractIssuesOrPullRequestMarkdownLinks(payload.pull_request.body),
    ...extractPullRequestURLLinks(payload.pull_request.body),
  ].filter(
    (link) =>
      link.owner === Organization.HOME_ASSISTANT &&
      `${link.owner}/${link.repo}` !== HomeAssistantRepository.HOME_ASSISTANT_IO,
  );

  if (linksToCode.length === 0) return;

  return { labels: ["has-parent"] };
}

async function updateDocsParentStatus(
  context: WebhookContext,
  payload: { pull_request: { body: string | null; state: string; merged: boolean } },
): Promise<void> {
  if (context.repository === HomeAssistantRepository.HOME_ASSISTANT_IO) return;

  const linksToDocs = [
    ...extractIssuesOrPullRequestMarkdownLinks(payload.pull_request.body),
    ...extractPullRequestURLLinks(payload.pull_request.body),
  ].filter((link) => `${link.owner}/${link.repo}` === HomeAssistantRepository.HOME_ASSISTANT_IO);

  if (linksToDocs.length !== 1) return;

  const docLink = linksToDocs[0];
  const parentState =
    payload.pull_request.state === "open"
      ? "open"
      : payload.pull_request.merged
        ? "merged"
        : "closed";

  if (parentState === "open") {
    const docsPR = await context.fetchPullRequestWithCache({
      owner: docLink.owner,
      repo: docLink.repo,
      pull_number: docLink.number,
    });
    const docsState = docsPR.state === "open" ? "open" : docsPR.merged ? "merged" : "closed";
    if (docsState === "open" || docsState === "merged") return;

    await context.github.pulls.update({
      owner: docLink.owner,
      repo: docLink.repo,
      pull_number: docLink.number,
      state: "open",
    });
  } else if (parentState === "closed") {
    await context.github.pulls.update({
      owner: docLink.owner,
      repo: docLink.repo,
      pull_number: docLink.number,
      state: "closed",
    });
  } else if (parentState === "merged") {
    await context.github.issues.addLabels({
      owner: docLink.owner,
      repo: docLink.repo,
      issue_number: docLink.number,
      labels: ["parent-merged"],
    });
  }
}
