import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Effect, Rule } from "../engine/types.js";
import { isDraftExplainerComment } from "./draft-on-changes-requested.js";

type HandledEvent = EventType.PULL_REQUEST_READY_FOR_REVIEW;

function isBotReview(review: { user: { type?: string } | null }): boolean {
  return (review.user?.type ?? "").toLowerCase() === "bot";
}

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  // Only PRs draft-on-changes-requested drafted get the follow-up; a marker-less draft
  // was the author's own doing and carries no pending reviewers to poke.
  const comments = await ctx.target.issueComments();
  if (!comments.some((c) => isDraftExplainerComment(c.body))) return;

  const reviews = await ctx.target.reviews();

  // A reviewer's verdict is their latest APPROVED/CHANGES_REQUESTED review;
  // an old changes-requested superseded by an approval needs no re-request.
  const latestByReviewer = new Map<string, string>();
  for (const review of reviews) {
    const login = review.user?.login;
    if (!login || isBotReview(review)) continue;
    if (review.state !== "APPROVED" && review.state !== "CHANGES_REQUESTED") continue;
    latestByReviewer.set(login, review.state);
  }

  const effects: Effect[] = [];

  // One effect per reviewer: a reviewer without review permission fails the
  // API call, and batching would take the others down with them.
  for (const [login, state] of latestByReviewer) {
    if (state === "CHANGES_REQUESTED") {
      effects.push({ type: "requestReviewers", reviewers: [login] });
    }
  }

  // Bot verdicts can't be re-requested — dismiss them as stale instead.
  for (const review of reviews) {
    if (isBotReview(review) && review.state === "CHANGES_REQUESTED") {
      effects.push({ type: "dismissReview", reviewId: review.id, message: "Stale" });
    }
  }

  return effects.length > 0 ? effects : undefined;
}

export const readyForReview: Rule = {
  name: "ready-for-review",
  description:
    "When a PR draft-on-changes-requested drafted goes ready for review, re-requests " +
    "the reviewers who requested changes and dismisses stale bot reviews.",
  events: on([EventType.PULL_REQUEST_READY_FOR_REVIEW], evaluate),
};
