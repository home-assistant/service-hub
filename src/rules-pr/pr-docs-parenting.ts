import type {
  PullRequestClosedEvent,
  PullRequestEditedEvent,
  PullRequestOpenedEvent,
} from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";
import { extractAllLinks } from "../utils/text-parser.js";

type DocsParentingPayload =
  | PullRequestOpenedEvent
  | PullRequestEditedEvent
  | PullRequestClosedEvent;

function findDocsLinks(body: string | null) {
  return extractAllLinks(body).filter(
    (link) => `${link.owner}/${link.repo}` === HomeAssistantRepository.HOME_ASSISTANT_IO,
  );
}

export const docsParentingCodeSide: Rule = {
  name: "docs-parenting-code-side",
  description: "Labels linked docs PRs with 'has-parent' and syncs parent status on close/reopen",
  listens: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_CLOSED,
    EventType.PULL_REQUEST_EDITED,
  ],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as DocsParentingPayload;

    if (
      context.eventType === EventType.PULL_REQUEST_REOPENED ||
      context.eventType === EventType.PULL_REQUEST_CLOSED
    ) {
      return { actions: [async (ctx) => updateDocsParentStatus(ctx, payload)] };
    }

    // opened or edited
    const linksToDocs = findDocsLinks(payload.pull_request.body);

    if (linksToDocs.length === 0 || linksToDocs.length > 2) return;

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
  },
};

async function updateDocsParentStatus(
  context: WebhookContext,
  payload: DocsParentingPayload,
): Promise<void> {
  const linksToDocs = findDocsLinks(payload.pull_request.body);

  if (linksToDocs.length !== 1) return;

  const docLink = linksToDocs[0];

  const isClosed = "action" in payload && payload.action === "closed";
  const isMerged =
    isClosed &&
    "pull_request" in payload &&
    (payload as PullRequestClosedEvent).pull_request.merged;
  const parentState = !isClosed ? "open" : isMerged ? "merged" : "closed";

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
