import type {
  PullRequestReadyForReviewEvent,
  PullRequestReviewSubmittedEvent,
} from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { convertPullRequestToDraft } from "../github/client.js";
import { EventType, Organization } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";

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

export const prDraftOnChangesRequested: Rule = {
  name: "review-drafter",
  listens: [EventType.PULL_REQUEST_REVIEW_SUBMITTED, EventType.PULL_REQUEST_READY_FOR_REVIEW],

  async handle(_context: WebhookContext): Promise<RuleResult | undefined> {
    // This handler is complex and performs many conditional API calls,
    // so it uses the actions escape hatch.
    return {
      actions: [
        async (ctx) => {
          if (ctx.eventType === EventType.PULL_REQUEST_REVIEW_SUBMITTED) {
            await handleReviewSubmitted(ctx);
          } else if (ctx.eventType === EventType.PULL_REQUEST_READY_FOR_REVIEW) {
            await handleReadyForReview(ctx);
          }
        },
      ],
    };
  },
};

function isCopilotLogin(login: string | undefined | null): boolean {
  return !!login && COPILOT_LOGINS.has(login.toLowerCase());
}

async function handleReviewSubmitted(context: WebhookContext): Promise<void> {
  const payload = context.payload as PullRequestReviewSubmittedEvent;

  if (isCopilotLogin(payload.review.user?.login)) {
    await handleCopilotReview(context);
    return;
  }

  if (payload.pull_request.draft || payload.review.state !== "changes_requested") {
    return;
  }

  if (payload.sender.type !== "Bot") {
    try {
      const { data: membership } = await context.github.orgs.getMembershipForUser({
        org: context.organization,
        username: payload.review.user.login,
      });
      if (!["admin", "member"].includes(membership.role)) return;
    } catch {
      return;
    }
  }

  await convertPullRequestToDraft(context.github, payload.pull_request.node_id);

  const comments = await context.github.paginate(context.github.issues.listComments, {
    ...context.issue(),
    per_page: 100,
  });

  if (!comments.find((c) => c.body?.startsWith(MESSAGE_ID))) {
    await context.github.issues.createComment(
      context.issue({ body: reviewComment(context.organization) }),
    );
  }
}

async function handleReadyForReview(context: WebhookContext): Promise<void> {
  const payload = context.payload as PullRequestReadyForReviewEvent;

  const unanswered = await findUnansweredCopilotFindings(context);

  const comments = await context.github.paginate(context.github.issues.listComments, {
    ...context.issue(),
    per_page: 100,
  });

  await markCopilotCommentOutdated(context, comments);

  if (unanswered.length) {
    await convertPullRequestToDraft(context.github, payload.pull_request.node_id);
    await context.github.issues.createComment(
      context.issue({
        body: copilotReviewComment(
          unanswered.length,
          unanswered.slice(0, 10).map((f) => f.url),
        ),
      }),
    );
    return;
  }

  if (!comments.find((c) => c.body?.startsWith(MESSAGE_ID))) {
    return;
  }

  const { data: reviews } = await context.github.pulls.listReviews(
    context.pullRequest({ per_page: 100 }),
  );

  const requestedChanges = reviews.filter((r) => r.state === "CHANGES_REQUESTED");
  const humanReviewers = new Set(
    requestedChanges
      .filter((r) => r.user?.type?.toLowerCase() !== "bot")
      .map((r) => r.user?.login)
      .filter(Boolean) as string[],
  );

  for (const reviewer of humanReviewers) {
    try {
      await context.github.pulls.requestReviewers(context.pullRequest({ reviewers: [reviewer] }));
    } catch {
      // Ignore non-member reviewer
    }
  }

  const botReviews = requestedChanges.filter((r) => r.user?.type?.toLowerCase() === "bot");
  for (const review of botReviews) {
    await context.github.pulls.dismissReview(
      context.pullRequest({ review_id: review.id, message: "Stale" }),
    );
  }
}

async function handleCopilotReview(context: WebhookContext): Promise<void> {
  const payload = context.payload as PullRequestReviewSubmittedEvent;

  const unanswered = await findUnansweredCopilotFindings(context);
  if (!unanswered.length) return;

  if (!payload.pull_request.draft) {
    await convertPullRequestToDraft(context.github, payload.pull_request.node_id);
  }

  await createOrUpdateCopilotComment(context, unanswered);
}

async function findUnansweredCopilotFindings(
  context: WebhookContext,
): Promise<UnansweredFinding[]> {
  const payload = context.payload as
    | PullRequestReviewSubmittedEvent
    | PullRequestReadyForReviewEvent;
  const authorLogin = payload.pull_request.user.login.toLowerCase();

  const reviewComments = await context.github.paginate(
    context.github.pulls.listReviewComments,
    context.pullRequest({ per_page: 100 }),
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
      const reactions = await context.github.paginate(
        context.github.reactions.listForPullRequestReviewComment,
        context.repo({ comment_id: finding.id, per_page: 100 }),
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

async function markCopilotCommentOutdated(
  context: WebhookContext,
  issueComments: Array<{ id: number; body?: string | null }>,
): Promise<void> {
  const activeComment = issueComments.find((c) => c.body?.startsWith(COPILOT_MESSAGE_ID));
  if (!activeComment) return;

  const remainingBody = (activeComment.body ?? "").replace(COPILOT_MESSAGE_ID, "").trimStart();
  await context.github.issues.updateComment(
    context.repo({
      comment_id: activeComment.id,
      body: `${COPILOT_OUTDATED_NOTICE}${remainingBody}`,
    }),
  );
}

async function createOrUpdateCopilotComment(
  context: WebhookContext,
  unanswered: UnansweredFinding[],
): Promise<void> {
  const comments = await context.github.paginate(context.github.issues.listComments, {
    ...context.issue(),
    per_page: 100,
  });
  const existing = comments.find((c) => c.body?.startsWith(COPILOT_MESSAGE_ID));
  const body = copilotReviewComment(
    unanswered.length,
    unanswered.slice(0, 10).map((f) => f.url),
  );

  if (existing) {
    await context.github.issues.updateComment(context.repo({ comment_id: existing.id, body }));
  } else {
    await context.github.issues.createComment(context.issue({ body }));
  }
}
