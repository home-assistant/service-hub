import { readFileSync } from "node:fs";
import Mustache from "mustache";
import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Effect, Rule, RuleOutput } from "../engine/types.js";

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

// Layout and prose live in the template; this rule only builds the view.
// The marker is written literally there but grepped for here — fail at load
// if a template edit breaks the pair (once-per-PR detection depends on it).
const EXPLAINER_TEMPLATE = readFileSync(
  new URL("./draft-on-changes-requested.md", import.meta.url),
  "utf-8",
);
if (!EXPLAINER_TEMPLATE.includes(DRAFT_ON_CHANGES_REQUESTED_MARKER)) {
  throw new Error("draft-on-changes-requested template lost its marker comment");
}

function reviewComment(org: string): string {
  // Escaping disabled: the output is markdown, not HTML.
  return Mustache.render(
    EXPLAINER_TEMPLATE,
    { moreInfoUrl: MORE_INFO_URL[org] ?? MORE_INFO_URL["home-assistant"] },
    undefined,
    { escape: String },
  );
}

type HandledEvent = EventType.PULL_REQUEST_REVIEW_SUBMITTED;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
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
  return { effects };
}

export const draftOnChangesRequested: Rule = {
  name: "draft-on-changes-requested",
  description:
    "Converts a PR to draft when a member or bot review requests changes, and explains " +
    "the ready-for-review flow once per PR.",
  events: on([EventType.PULL_REQUEST_REVIEW_SUBMITTED], evaluate),
};
