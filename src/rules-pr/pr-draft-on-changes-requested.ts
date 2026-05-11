import type {
  PullRequestReadyForReviewEvent,
  PullRequestReviewSubmittedEvent,
} from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, Organization } from "../github/types.js";
import type { Effect, Rule } from "../rules/types.js";

const MESSAGE_ID = "<!-- ReviewDrafterComment -->";
const COPILOT_MESSAGE_ID = "<!-- ReviewDrafterCopilotComment -->";
const COPILOT_OUTDATED_MESSAGE_ID = "<!-- ReviewDrafterCopilotCommentOutdated -->";

const COPILOT_LOGINS = new Set(["copilot"]);
const ACKNOWLEDGMENT_REACTIONS = new Set(["+1", "heart", "hooray", "rocket"]);

const MORE_INFO_URL: Partial<Record<string, string>> = {
  [Organization.ESPHOME]:
    "https://esphome.io/guides/contributing#prs-are-being-drafted-when-changes-are-needed",
  [Organization.HOME_ASSISTANT]:
    "https://developers.home-assistant.io/docs/review-process#prs-are-being-drafted-when-changes-are-needed",
};

function reviewComment(organization: string): string {
  const url = MORE_INFO_URL[organization] ?? "";
  return `${MESSAGE_ID}
Please take a look at the requested changes, and use the **Ready for review** button when you are done, thanks :+1:

[_Learn more about our pull request process._](${url})
`;
}

function copilotReviewComment(findingsCount: number, findingLinks: string[]): string {
  return `${COPILOT_MESSAGE_ID}
Copilot left ${findingsCount} finding${findingsCount === 1 ? "" : "s"} that still need an author reply.

Please reply to each Copilot finding in-thread before marking this PR as **Ready for review**.

Open finding threads:
${findingLinks.map((link) => `- ${link}`).join("\n")}
`;
}

const COPILOT_OUTDATED_NOTICE = `${COPILOT_OUTDATED_MESSAGE_ID}
> [!NOTE]
> This Copilot review tracker is outdated.

`;

interface UnansweredFinding {
  id: number;
  url: string;
}

function isCopilotLogin(login: string | undefined | null): boolean {
  return !!login && COPILOT_LOGINS.has(login.toLowerCase());
}

async function findUnansweredCopilotFindings(
  ctx: WebhookContext<PullRequestReviewSubmittedEvent | PullRequestReadyForReviewEvent>,
): Promise<UnansweredFinding[]> {
  const authorLogin = ctx.payload.pull_request.user.login.toLowerCase();

  const reviewComments = await ctx.github.paginate(
    ctx.github.pulls.listReviewComments,
    ctx.pullRequest({ per_page: 100 }),
  );

  const copilotFindings = reviewComments.filter(
    (c) => !c.in_reply_to_id && isCopilotLogin(c.user?.login),
  );
  if (!copilotFindings.length) return [];

  const authorReplies = new Set(
    reviewComments
      .filter((c) => c.in_reply_to_id && c.user?.login?.toLowerCase() === authorLogin)
      .map((c) => c.in_reply_to_id as number),
  );

  const findingHasReaction = await Promise.all(
    copilotFindings.map(async (finding) => {
      const reactions = await ctx.github.paginate(
        ctx.github.reactions.listForPullRequestReviewComment,
        ctx.repo({ comment_id: finding.id, per_page: 100 }),
      );
      return reactions.some(
        (r) =>
          r.user?.login?.toLowerCase() === authorLogin && ACKNOWLEDGMENT_REACTIONS.has(r.content),
      );
    }),
  );

  return copilotFindings
    .filter((finding, idx) => !authorReplies.has(finding.id) && !findingHasReaction[idx])
    .map((finding) => ({ id: finding.id, url: finding.html_url }));
}

async function handleCopilotReview(
  ctx: WebhookContext<PullRequestReviewSubmittedEvent>,
): Promise<Effect[] | undefined> {
  const unanswered = await findUnansweredCopilotFindings(ctx);
  if (!unanswered.length) return;

  const effects: Effect[] = [];
  if (!ctx.payload.pull_request.draft) {
    effects.push({ type: "convertPullRequestToDraft", node_id: ctx.payload.pull_request.node_id });
  }

  const comments = await ctx.github.paginate(ctx.github.issues.listComments, {
    ...ctx.issue(),
    per_page: 100,
  });
  const existing = comments.find((c) => c.body?.startsWith(COPILOT_MESSAGE_ID));
  const body = copilotReviewComment(
    unanswered.length,
    unanswered.slice(0, 10).map((f) => f.url),
  );

  if (existing) {
    effects.push({ type: "updateComment", comment_id: existing.id, body });
  } else {
    effects.push({ type: "comment", body });
  }
  return effects;
}

async function handleReviewSubmitted(
  ctx: WebhookContext<PullRequestReviewSubmittedEvent>,
): Promise<Effect[] | undefined> {
  const payload = ctx.payload;

  if (isCopilotLogin(payload.review.user?.login)) {
    return handleCopilotReview(ctx);
  }

  if (payload.pull_request.draft || payload.review.state !== "changes_requested") {
    return;
  }

  if (payload.sender.type !== "Bot") {
    try {
      const { data: membership } = await ctx.github.orgs.getMembershipForUser({
        org: ctx.organization,
        username: payload.review.user.login,
      });
      if (!["admin", "member"].includes(membership.role)) return;
    } catch (err) {
      console.warn(
        `prDraftOnChangesRequested: org membership check for ${payload.review.user.login} failed:`,
        err,
      );
      return;
    }
  }

  const effects: Effect[] = [
    { type: "convertPullRequestToDraft", node_id: payload.pull_request.node_id },
  ];

  const comments = await ctx.github.paginate(ctx.github.issues.listComments, {
    ...ctx.issue(),
    per_page: 100,
  });

  if (!comments.find((c) => c.body?.startsWith(MESSAGE_ID))) {
    effects.push({ type: "comment", body: reviewComment(ctx.organization) });
  }
  return effects;
}

async function handleReadyForReview(
  ctx: WebhookContext<PullRequestReadyForReviewEvent>,
): Promise<Effect[] | undefined> {
  const payload = ctx.payload;
  const unanswered = await findUnansweredCopilotFindings(ctx);

  const comments = await ctx.github.paginate(ctx.github.issues.listComments, {
    ...ctx.issue(),
    per_page: 100,
  });

  const effects: Effect[] = [];
  const outdatedTracker = comments.find((c) => c.body?.startsWith(COPILOT_MESSAGE_ID));
  if (outdatedTracker) {
    const remainingBody = (outdatedTracker.body ?? "").replace(COPILOT_MESSAGE_ID, "").trimStart();
    effects.push({
      type: "updateComment",
      comment_id: outdatedTracker.id,
      body: `${COPILOT_OUTDATED_NOTICE}${remainingBody}`,
    });
  }

  if (unanswered.length) {
    effects.push(
      { type: "convertPullRequestToDraft", node_id: payload.pull_request.node_id },
      {
        type: "comment",
        body: copilotReviewComment(
          unanswered.length,
          unanswered.slice(0, 10).map((f) => f.url),
        ),
      },
    );
    return effects;
  }

  if (!comments.find((c) => c.body?.startsWith(MESSAGE_ID))) {
    return effects.length ? effects : undefined;
  }

  const { data: reviews } = await ctx.github.pulls.listReviews(ctx.pullRequest({ per_page: 100 }));

  const requestedChanges = reviews.filter((r) => r.state === "CHANGES_REQUESTED");
  const humanReviewers = new Set(
    requestedChanges
      .filter((r) => r.user?.type?.toLowerCase() !== "bot")
      .map((r) => r.user?.login)
      .filter(Boolean) as string[],
  );

  for (const reviewer of humanReviewers) {
    effects.push({ type: "requestReviewers", reviewers: [reviewer] });
  }

  const botReviews = requestedChanges.filter((r) => r.user?.type?.toLowerCase() === "bot");
  for (const review of botReviews) {
    effects.push({ type: "dismissReview", review_id: review.id, message: "Stale" });
  }

  return effects.length ? effects : undefined;
}

export const prDraftOnChangesRequested: Rule = {
  name: "review-drafter",
  description: "Converts PR to draft when changes are requested and manages review re-requests",
  events: {
    [EventType.PULL_REQUEST_REVIEW_SUBMITTED]: handleReviewSubmitted,
    [EventType.PULL_REQUEST_READY_FOR_REVIEW]: handleReadyForReview,
  },
};
