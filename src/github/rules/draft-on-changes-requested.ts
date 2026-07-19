import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Effect, Rule } from "../engine/types.js";

export const DRAFT_ON_CHANGES_REQUESTED_MARKER = "<!-- ha-bot-draft-on-changes-requested -->";

// The legacy bot's ReviewDrafter marker — never written anymore, but still
// recognized so PRs it commented on don't get a second comment.
const LEGACY_MARKER = "<!-- ReviewDrafterComment -->";

/**
 * Whether this comment is the drafting explainer (current or legacy deploy).
 * ready-for-review keys off it too: no marker means the draft state wasn't
 * ours, so going ready shouldn't re-request anyone.
 */
export function isDraftExplainerComment(body: string | null | undefined): boolean {
  return (
    !!body && (body.includes(DRAFT_ON_CHANGES_REQUESTED_MARKER) || body.includes(LEGACY_MARKER))
  );
}

const MORE_INFO_URL: Record<string, string> = {
  esphome: "https://esphome.io/guides/contributing#prs-are-being-drafted-when-changes-are-needed",
  "home-assistant":
    "https://developers.home-assistant.io/docs/review-process#prs-are-being-drafted-when-changes-are-needed",
};

function reviewComment(org: string): string {
  return `${DRAFT_ON_CHANGES_REQUESTED_MARKER}
Please take a look at the requested changes, and use the **Ready for review** button when you are done, thanks :+1:

[_Learn more about our pull request process._](${MORE_INFO_URL[org] ?? MORE_INFO_URL["home-assistant"]})
`;
}

type HandledEvent = EventType.PULL_REQUEST_REVIEW_SUBMITTED;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  if (ctx.event.reviewState !== "changes_requested") return;
  if ((await ctx.target.state()) !== "open") return;
  if (await ctx.target.isDraft()) return;

  // Only reviews that carry weight draft the PR: bots, or org members. The
  // review webhook's sender is the reviewer.
  if (!ctx.senderIsBot && !(await ctx.hasMember(ctx.event.reviewer))) return;

  const effects: Effect[] = [{ type: "convertToDraft" }];
  const comments = await ctx.target.issueComments();
  if (!comments.some((c) => isDraftExplainerComment(c.body))) {
    effects.push({ type: "comment", body: reviewComment(ctx.org.name) });
  }
  return effects;
}

export const draftOnChangesRequested: Rule = {
  name: "draft-on-changes-requested",
  description:
    "Converts a PR to draft when a member or bot review requests changes, and explains " +
    "the ready-for-review flow once per PR.",
  events: on([EventType.PULL_REQUEST_REVIEW_SUBMITTED], evaluate),
};
