import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_READY_FOR_REVIEW
  | EventType.PULL_REQUEST_REVIEW_SUBMITTED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

const ACK_REACTIONS = new Set(["+1", "heart", "hooray", "rocket"]);
const SECTION_ID = "review-comments";
const SECTION_TITLE = "Review comments";
const MAX_LINKS = 10;

async function evaluate(ctx: WebhookContext<EventPayloadMap[HandledEvent]>): Promise<Effect[]> {
  const authorLogin = ctx.payload.pull_request.user.login.toLowerCase();

  const reviewComments = await ctx.github.paginate(
    ctx.github.pulls.listReviewComments,
    ctx.pullRequest({ per_page: 100 }),
  );

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

  // Comments the author has acknowledged via reaction (+1, heart, hooray, rocket).
  const hasAck = await Promise.all(
    topLevel.map(async (c) => {
      const reactions = await ctx.github.paginate(
        ctx.github.reactions.listForPullRequestReviewComment,
        ctx.repo({ comment_id: c.id, per_page: 100 }),
      );
      return reactions.some(
        (r) => r.user?.login?.toLowerCase() === authorLogin && ACK_REACTIONS.has(r.content),
      );
    }),
  );

  const unresolved = topLevel.filter((c, idx) => !repliedTo.has(c.id) && !hasAck[idx]);

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

export const prReviewComments: Rule = {
  name: "pr-review-comments",
  description:
    "Surfaces unresolved inline review comments as a dashboard row; fails until each " +
    "comment has been replied to or acknowledged via reaction by the PR author.",
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
