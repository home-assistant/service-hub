import type {
  PullRequestClosedEvent,
  PullRequestEditedEvent,
  PullRequestOpenedEvent,
  PullRequestReopenedEvent,
} from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";
import { extractAllLinks } from "../utils/text-parser.js";

function findDocsLinks(body: string | null) {
  return extractAllLinks(body).filter(
    (link) => `${link.owner}/${link.repo}` === HomeAssistantRepository.HOME_ASSISTANT_IO,
  );
}

function handleOpenedOrEdited(
  ctx: WebhookContext<PullRequestOpenedEvent | PullRequestEditedEvent>,
): Effect[] | undefined {
  const linksToDocs = findDocsLinks(ctx.payload.pull_request.body);
  if (linksToDocs.length === 0 || linksToDocs.length > 2) return;
  return linksToDocs.map<Effect>((link) => ({
    type: "addLabelsCrossRepo",
    owner: link.owner,
    repo: link.repo,
    issue_number: link.number,
    labels: ["has-parent"],
  }));
}

async function handleClosedOrReopened(
  ctx: WebhookContext<PullRequestClosedEvent | PullRequestReopenedEvent>,
): Promise<Effect[] | undefined> {
  const linksToDocs = findDocsLinks(ctx.payload.pull_request.body);
  if (linksToDocs.length !== 1) return;
  const docLink = linksToDocs[0];

  const isClosed = ctx.payload.action === "closed";
  const isMerged =
    isClosed && "merged" in ctx.payload.pull_request && ctx.payload.pull_request.merged;
  const parentState = !isClosed ? "open" : isMerged ? "merged" : "closed";

  if (parentState === "open") {
    const docsPR = await ctx.fetchPullRequestWithCache({
      owner: docLink.owner,
      repo: docLink.repo,
      pull_number: docLink.number,
    });
    const docsState = docsPR.state === "open" ? "open" : docsPR.merged ? "merged" : "closed";
    if (docsState === "open" || docsState === "merged") return;

    return [
      {
        type: "updatePullRequest",
        owner: docLink.owner,
        repo: docLink.repo,
        pull_number: docLink.number,
        state: "open",
      },
    ];
  }

  if (parentState === "closed") {
    return [
      {
        type: "updatePullRequest",
        owner: docLink.owner,
        repo: docLink.repo,
        pull_number: docLink.number,
        state: "closed",
      },
    ];
  }

  // merged
  return [
    {
      type: "addLabelsCrossRepo",
      owner: docLink.owner,
      repo: docLink.repo,
      issue_number: docLink.number,
      labels: ["parent-merged"],
    },
  ];
}

/**
 * On-demand re-runs the labeling logic against the PR's current state.
 * Re-tagging docs PRs with `has-parent` is idempotent.
 * To not interfere with manual user intervention, we do not open/close
 * the docs PR here.
 */
async function handleOnDemand(
  ctx: WebhookContext<EventPayloadMap[EventType.ON_DEMAND]>,
): Promise<Effect[] | undefined> {
  const links = findDocsLinks(ctx.payload.pull_request.body);
  if (links.length === 0 || links.length > 2) return;

  const effects: Effect[] = links.map<Effect>((link) => ({
    type: "addLabelsCrossRepo",
    owner: link.owner,
    repo: link.repo,
    issue_number: link.number,
    labels: ["has-parent"],
  }));

  // For a merged code PR with a single docs link, surface `parent-merged`.
  if (links.length === 1 && ctx.payload.pull_request.merged_at) {
    effects.push({
      type: "addLabelsCrossRepo",
      owner: links[0].owner,
      repo: links[0].repo,
      issue_number: links[0].number,
      labels: ["parent-merged"],
    });
  }

  return effects;
}

export const docsParentingCodeSide: Rule = {
  name: "docs-parenting-code-side",
  description: "Labels linked docs PRs with 'has-parent' and syncs parent status on close/reopen",
  events: {
    [EventType.PULL_REQUEST_OPENED]: async (ctx) => handleOpenedOrEdited(ctx),
    [EventType.PULL_REQUEST_EDITED]: async (ctx) => handleOpenedOrEdited(ctx),
    [EventType.PULL_REQUEST_CLOSED]: async (ctx) => handleClosedOrReopened(ctx),
    [EventType.PULL_REQUEST_REOPENED]: async (ctx) => handleClosedOrReopened(ctx),
    [EventType.ON_DEMAND]: handleOnDemand,
  },
};
