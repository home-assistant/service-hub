import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../engine/rule.js";

const MAX_LINKS = 10;

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_READY_FOR_REVIEW
  | EventType.PULL_REQUEST_REVIEW_SUBMITTED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

// Acknowledgement means an in-thread reply. Reactions can't count: GitHub
// emits no webhook for them and they don't bump the PR's updated_at, so
// an event would never notice one.
async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome> {
  const authorLogin = (await ctx.target.authorLogin()).toLowerCase();
  const reviewComments = await ctx.target.reviewComments();

  if (reviewComments.length === 0) {
    return { status: "skip", message: "No inline review comments yet." };
  }

  // Top-level comments (not replies) from anyone other than the PR author.
  const topLevel = reviewComments.filter(
    (c) => !c.in_reply_to_id && c.user?.login?.toLowerCase() !== authorLogin,
  );

  // Comments the author has replied to in-thread.
  const repliedTo = new Set(
    reviewComments
      .filter((c) => c.in_reply_to_id && c.user?.login?.toLowerCase() === authorLogin)
      .map((c) => c.in_reply_to_id as number),
  );

  const unresolved = topLevel.filter((c) => !repliedTo.has(c.id));

  if (unresolved.length === 0) {
    return { status: "pass", message: "All inline review comments replied to." };
  }

  const lines = unresolved.slice(0, MAX_LINKS).map((c) => `- ${c.html_url}`);
  const extra = unresolved.length > MAX_LINKS ? `\n…and ${unresolved.length - MAX_LINKS} more` : "";
  const word = unresolved.length === 1 ? "comment" : "comments";
  return {
    status: "fail",
    message: `${unresolved.length} unresolved inline review ${word}:\n${lines.join("\n")}${extra}`,
  };
}

export const reviewComments = check({
  id: "review-comments",
  title: "Review comments",
  description:
    "Surfaces unresolved inline review comments as a dashboard row; fails until each " +
    "comment has been replied to.",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_READY_FOR_REVIEW,
    EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
