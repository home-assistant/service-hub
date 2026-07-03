import { PullRequest } from "../engine/model/pull-request.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";
import { EventType } from "../github/types.js";
import { extractAllLinks } from "../util/pr-body.js";
import { HomeAssistantRepository } from "../util/repositories.js";

function findDocsLinks(body: string | null) {
  return extractAllLinks(body).filter(
    (link) => `${link.owner}/${link.repo}` === HomeAssistantRepository.HOME_ASSISTANT_IO,
  );
}

async function handleOpenedOrEdited(
  ctx: RuleContext<EventType.PULL_REQUEST_OPENED | EventType.PULL_REQUEST_EDITED>,
): Promise<Effect[] | undefined> {
  const linksToDocs = findDocsLinks(await ctx.target.body());
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
  ctx: RuleContext<EventType.PULL_REQUEST_CLOSED | EventType.PULL_REQUEST_REOPENED>,
): Promise<Effect[] | undefined> {
  const linksToDocs = findDocsLinks(await ctx.target.body());
  if (linksToDocs.length !== 1) return;
  const docLink = linksToDocs[0];

  const isClosed = ctx.event.type === EventType.PULL_REQUEST_CLOSED;
  const isMerged = ctx.event.type === EventType.PULL_REQUEST_CLOSED && ctx.event.merged;
  const parentState = !isClosed ? "open" : isMerged ? "merged" : "closed";

  if (parentState === "open") {
    const docsPR = new PullRequest(ctx.github, {
      owner: docLink.owner,
      repo: docLink.repo,
      number: docLink.number,
    });
    const docsState =
      (await docsPR.state()) === "open" ? "open" : (await docsPR.merged()) ? "merged" : "closed";
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
  ctx: RuleContext<EventType.ON_DEMAND>,
): Promise<Effect[] | undefined> {
  const links = findDocsLinks(await ctx.target.body());
  if (links.length === 0 || links.length > 2) return;

  const effects: Effect[] = links.map<Effect>((link) => ({
    type: "addLabelsCrossRepo",
    owner: link.owner,
    repo: link.repo,
    issue_number: link.number,
    labels: ["has-parent"],
  }));

  // For a merged code PR with a single docs link, surface `parent-merged`.
  if (links.length === 1 && (await ctx.target.mergedAt())) {
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

export const docsParenting: Rule = {
  name: "docs-parenting",
  description: "Labels linked docs PRs with 'has-parent' and syncs parent status on close/reopen",
  events: {
    [EventType.PULL_REQUEST_OPENED]: handleOpenedOrEdited,
    [EventType.PULL_REQUEST_EDITED]: handleOpenedOrEdited,
    [EventType.PULL_REQUEST_CLOSED]: handleClosedOrReopened,
    [EventType.PULL_REQUEST_REOPENED]: handleClosedOrReopened,
    [EventType.ON_DEMAND]: handleOnDemand,
  },
};
