import type { Octokit } from "@octokit/rest";
import { log } from "../../log.js";
import type { GetIssueParams } from "./model/issue.js";
import { draftPRIfNotDraft } from "./pr-state.js";
import type { RuleContext } from "./rule-context.js";
import { buildStatus } from "./status/build.js";
import { isStatusComment, placeholderBody } from "./status/render.js";
import type { SectionOverride, StatusSection } from "./status/types.js";

/**
 * The impure half of the status subsystem: locate the status comment, feed
 * its body through the pure {@link buildStatus}, and write the results back —
 * comment, aggregate commit status, and the draft-on-failure follow-up.
 */

export const STATUS_CHECK_CONTEXT = "ha-bot";

export async function findStatusComment(
  github: Octokit,
  params: GetIssueParams,
): Promise<{ id: number; body: string } | null> {
  const comments = await github.paginate(github.issues.listComments, {
    ...params,
    per_page: 100,
  });

  for (const comment of comments) {
    if (comment.body && isStatusComment(comment.body)) {
      return { id: comment.id, body: comment.body };
    }
  }

  return null;
}

/**
 * Post a tiny placeholder status comment if none exists yet. Called at the
 * top of effect-application so the status comment sits above any other
 * comment (mention-code-owners, etc.) the same dispatch will create.
 */
export async function ensureStatusCommentExists(
  github: Octokit,
  params: GetIssueParams,
): Promise<void> {
  const existing = await findStatusComment(github, params);
  if (existing) return;
  await github.issues.createComment({ ...params, body: placeholderBody() });
}

/** The status-relevant effects of one dispatch, bucketed by the dispatcher. */
export interface StatusChanges {
  sections: StatusSection[];
  removedSectionIds: ReadonlySet<string>;
  overrides: SectionOverride[];
}

/**
 * Upsert the status comment, then write a single aggregate `ha-bot` commit
 * status whose target_url deep-links to the comment. Sequential — we need the
 * comment URL before posting the status. Rules emit `statusSection` effects;
 * the commit status is synthesized here so individual rules don't have to.
 *
 * Also sweeps stale commit statuses written by older deploys (any contexts
 * no live rule claims); stale comment sections are swept inside buildStatus.
 */
export async function syncStatus(
  context: RuleContext,
  changes: StatusChanges,
  knownSectionIds: ReadonlySet<string>,
): Promise<void> {
  const params = context.issueParams();
  const existing = await findStatusComment(context.github, params);

  const result = buildStatus({
    target: {
      kind: context.target.kind,
      repoFullName: context.repository,
      author: await context.target.authorLogin(),
    },
    newSections: changes.sections,
    removedSectionIds: changes.removedSectionIds,
    overrides: changes.overrides,
    previousBody: existing?.body ?? null,
    knownSectionIds,
    help: { commandSlug: context.commandSlug, commands: context.commands },
  });
  if (result.body === null) return;

  const { data: comment } = existing
    ? await context.github.issues.updateComment({
        owner: params.owner,
        repo: params.repo,
        comment_id: existing.id,
        body: result.body,
      })
    : await context.github.issues.createComment({ ...params, body: result.body });

  if (context.target.kind !== "pull_request") return;
  const headSha = await context.target.headSha();
  if (!headSha) return;

  // Sweep stale status checks (best-effort; failures here shouldn't sink the
  // primary write below). The bot writes only the `ha-bot` aggregate going
  // forward — anything else we created on this commit is from an older deploy.
  const sweep = sweepStaleStatusChecks(context, headSha).catch((err) => {
    log.warn("sweepStaleStatusChecks failed", { error: String(err) });
  });
  await context.github.repos.createCommitStatus(
    context.repoParams({
      sha: headSha,
      context: STATUS_CHECK_CONTEXT,
      state: result.aggregate.state,
      description: result.aggregate.description,
      target_url: comment.html_url,
    }),
  );
  if (result.aggregate.shouldDraft) {
    await draftPRIfNotDraft(context);
  }
  await sweep;
}

/**
 * Find commit statuses on the head SHA that *we* wrote (matched by creator
 * login = `<botSlug>[bot]`) whose context isn't the dispatcher's aggregate
 * `ha-bot` context, and neutralize them to `success` + "No longer in use".
 * GitHub has no "delete status" API; overwriting is the closest equivalent.
 *
 * Rules write only `statusSection` effects going forward; the single
 * `ha-bot` status is the bot's sole commit-status output. Any other context
 * we own on this commit is therefore from an older deploy.
 */
async function sweepStaleStatusChecks(context: RuleContext, headSha: string): Promise<void> {
  const { data: statuses } = await context.github.repos.listCommitStatusesForRef(
    context.repoParams({ ref: headSha, per_page: 100 }),
  );
  // Collapse to the latest status per context (API returns newest first).
  const latestByContext = new Map<string, (typeof statuses)[number]>();
  for (const s of statuses) {
    if (!latestByContext.has(s.context)) latestByContext.set(s.context, s);
  }

  const ourLogin = context.botLogin.toLowerCase();
  const stale = [...latestByContext.values()].filter(
    (s) =>
      s.creator?.login?.toLowerCase() === ourLogin &&
      s.context !== STATUS_CHECK_CONTEXT &&
      s.state !== "success",
  );
  if (stale.length === 0) return;
  log.info("sweep: neutralizing stale statuses", {
    count: stale.length,
    contexts: stale.map((s) => s.context).join(", "),
  });
  await Promise.all(
    stale.map((s) =>
      context.github.repos
        .createCommitStatus(
          context.repoParams({
            sha: headSha,
            context: s.context,
            state: "success" as const,
            description: "No longer in use",
          }),
        )
        .catch((err) => {
          log.warn("sweep: failed to neutralize status", {
            context: s.context,
            error: String(err),
          });
        }),
    ),
  );
}
