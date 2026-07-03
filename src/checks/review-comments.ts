import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_READY_FOR_REVIEW
  | EventType.PULL_REQUEST_REVIEW_SUBMITTED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

const ACK_REACTIONS = ["+1", "heart", "hooray", "rocket"] as const;
const SECTION_ID = "review-comments";
const SECTION_TITLE = "Review comments";
const MAX_LINKS = 10;

/**
 * Acknowledgement via the reactions rollup each review comment carries —
 * no per-comment reaction fetches. The rollup has no reactor identity, so
 * any ack-type reaction counts, not just the PR author's.
 */
function hasAckReaction(
  reactions: Partial<Record<(typeof ACK_REACTIONS)[number], number>> | undefined,
): boolean {
  if (!reactions) return false;
  return ACK_REACTIONS.some((kind) => (reactions[kind] ?? 0) > 0);
}

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[]> {
  const authorLogin = (await ctx.target.authorLogin()).toLowerCase();
  const reviewComments = await ctx.target.reviewComments();

  if (reviewComments.length === 0) {
    return [
      {
        type: "dashboardSection",
        section: {
          id: SECTION_ID,
          title: SECTION_TITLE,
          status: "skip",
          message: "No inline review comments yet.",
        },
      },
    ];
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

  const unresolved = topLevel.filter((c) => !repliedTo.has(c.id) && !hasAckReaction(c.reactions));

  if (unresolved.length === 0) {
    return [
      {
        type: "dashboardSection",
        section: {
          id: SECTION_ID,
          title: SECTION_TITLE,
          status: "pass",
          message: "All inline review comments addressed (replied or acknowledged).",
        },
      },
    ];
  }

  const lines = unresolved.slice(0, MAX_LINKS).map((c) => `- ${c.html_url}`);
  const extra = unresolved.length > MAX_LINKS ? `\n…and ${unresolved.length - MAX_LINKS} more` : "";
  const word = unresolved.length === 1 ? "comment" : "comments";
  const message = `${unresolved.length} unresolved inline review ${word}:\n${lines.join("\n")}${extra}`;

  return [
    {
      type: "dashboardSection",
      section: {
        id: SECTION_ID,
        title: SECTION_TITLE,
        status: "fail",
        message,
      },
    },
  ];
}

export const reviewComments: Rule = {
  name: "review-comments",
  description:
    "Surfaces unresolved inline review comments as a dashboard row; fails until each " +
    "comment has been replied to or acknowledged via reaction.",
  dashboardSections: [SECTION_ID],
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_REOPENED]: evaluate,
    [EventType.PULL_REQUEST_READY_FOR_REVIEW]: evaluate,
    [EventType.PULL_REQUEST_REVIEW_SUBMITTED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
    [EventType.ON_DEMAND]: evaluate,
  },
};
