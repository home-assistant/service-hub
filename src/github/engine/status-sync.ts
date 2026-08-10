import type { Octokit } from "@octokit/rest";
import { log } from "../../log.js";
import type { GetIssueParams } from "./model/issue.js";
import type { RuleContext } from "./model/rule-context.js";
import type { BlockUpdates } from "./status/blocks.js";
import { buildStatus, type StatusAggregate } from "./status/build.js";
import { isStatusComment, placeholderBody } from "./status/render.js";
import type { RuleState, SectionOverride, StatusSection } from "./status/types.js";

/**
 * The impure half of the status subsystem: locate the status comment, feed
 * the dispatch's status changes through the pure {@link buildStatus}, and
 * write the results back. Split in two so the dispatcher owns the decisions:
 * {@link syncDashboard} writes the comment and reports the aggregate;
 * {@link updateCommitStatus} writes the aggregate commit status. Drafting is
 * the dispatcher's call.
 */

export const STATUS_CHECK_CONTEXT = "ha-bot";

type CommitStatuses = Awaited<ReturnType<Octokit["repos"]["listCommitStatusesForRef"]>>["data"];

/** The located (or just-created) status comment. */
export interface StatusCommentRef {
  id: number;
  body: string;
  html_url: string;
  /** True when this call created the placeholder — persisted state is empty. */
  fresh: boolean;
}

export async function findStatusComment(
  github: Octokit,
  params: GetIssueParams,
): Promise<{ id: number; body: string; html_url: string } | null> {
  const comments = await github.paginate(github.issues.listComments, {
    ...params,
    per_page: 100,
  });

  for (const comment of comments) {
    if (comment.body && isStatusComment(comment.body)) {
      return { id: comment.id, body: comment.body, html_url: comment.html_url };
    }
  }

  return null;
}

/**
 * The dispatch's single status-comment lookup. With `createIfMissing`, posts
 * the tiny placeholder when none exists — done up front so the status comment
 * sits above any other comment the same dispatch will create. A `fresh`
 * result carries no persisted state, so callers skip parsing entirely.
 */
export async function locateStatusComment(
  github: Octokit,
  params: GetIssueParams,
  options: { createIfMissing: boolean },
): Promise<StatusCommentRef | null> {
  const existing = await findStatusComment(github, params);
  if (existing) return { ...existing, fresh: false };
  if (!options.createIfMissing) return null;

  const body = placeholderBody();
  const { data } = await github.issues.createComment({ ...params, body });
  return { id: data.id, body, html_url: data.html_url, fresh: true };
}

/** The status-domain outputs of one dispatch, bucketed by the dispatcher. */
export interface StatusChanges {
  sections: StatusSection[];
  overrides: SectionOverride[];
  /** Block updates: args replace the persisted state, `null` clears. */
  blocks: BlockUpdates;
  /** The merged rule-persisted data bag to embed (stale keys already swept). */
  data: Record<string, unknown>;
}

/** What one dashboard write concluded, for the dispatcher to act on. */
export interface DashboardResult {
  /** Post-merge, post-override section state (what the comment embeds). */
  sections: StatusSection[];
  aggregate: StatusAggregate;
  /** Deep link to the status comment; null when nothing was written. */
  commentUrl: string | null;
}

/**
 * Upsert the status comment from this dispatch's status changes. Pure
 * decision-making lives in {@link buildStatus}; this writes the body back and
 * hands the aggregate to the caller — it does not touch commit statuses or
 * the PR's draft state.
 */
export async function syncDashboard(
  context: RuleContext,
  changes: StatusChanges,
  existing: StatusCommentRef | null,
  previous: RuleState | null,
  knownSectionIds: ReadonlySet<string>,
): Promise<DashboardResult> {
  const params = context.issueParams();

  const result = buildStatus({
    target: {
      kind: context.target.kind,
      repoFullName: context.repo.fullName,
      author: await context.target.authorLogin(),
    },
    newSections: changes.sections,
    overrides: changes.overrides,
    blocks: changes.blocks,
    data: changes.data,
    previous,
    knownSectionIds,
    help: { commandSlug: context.env.COMMAND_SLUG, commands: context.commands },
  });
  if (result.body === null) {
    return { sections: result.sections, aggregate: result.aggregate, commentUrl: null };
  }

  // Re-evaluations (cron sweeps, `/… update`) usually rebuild the identical
  // body; rewriting it anyway would bump the comment's updated_at on every
  // pass.
  let commentUrl: string;
  if (existing) {
    if (existing.body !== result.body) {
      await context.github.issues.updateComment({
        owner: params.owner,
        repo: params.repo,
        comment_id: existing.id,
        body: result.body,
      });
    }
    commentUrl = existing.html_url;
  } else {
    const { data } = await context.github.issues.createComment({ ...params, body: result.body });
    commentUrl = data.html_url;
  }

  return { sections: result.sections, aggregate: result.aggregate, commentUrl };
}

/**
 * Write the single aggregate `ha-bot` commit status on the PR head, deep-
 * linking to the status comment. Also sweeps stale commit statuses written
 * by older deploys (any contexts no live rule claims); stale comment
 * sections are swept inside buildStatus.
 */
export async function updateCommitStatus(
  context: RuleContext,
  aggregate: StatusAggregate,
  commentUrl: string,
): Promise<void> {
  if (context.target.kind !== "pull_request") return;
  const headSha = await context.target.headSha();
  if (!headSha) return;

  // One listing serves both the idempotence check and the stale sweep.
  // Fail open: if it errors, write the status unconditionally and skip the
  // sweep — a listing hiccup must not sink the primary write.
  const statuses = await context.github.repos
    .listCommitStatusesForRef(context.repoParams({ ref: headSha, per_page: 100 }))
    .then((res): CommitStatuses | null => res.data)
    .catch((err) => {
      log.warn("updateCommitStatus: listing commit statuses failed", { error: String(err) });
      return null;
    });

  // Sweep stale status checks (best-effort; failures here shouldn't sink the
  // primary write below). The bot writes only the `ha-bot` aggregate going
  // forward — anything else we created on this commit is from an older deploy.
  const sweep = statuses
    ? sweepStaleStatusChecks(context, headSha, statuses).catch((err) => {
        log.warn("sweepStaleStatusChecks failed", { error: String(err) });
      })
    : Promise.resolve();

  // Statuses are append-only: same-context writes pile up as separate objects
  // and GitHub displays the newest one. The listing is newest-first, so `find`
  // yields the entry currently shown — the one worth comparing against.
  const latest = statuses?.find((s) => s.context === STATUS_CHECK_CONTEXT);
  const statusUnchanged =
    latest !== undefined &&
    latest.state === aggregate.state &&
    latest.description === aggregate.description &&
    latest.target_url === commentUrl;
  if (!statusUnchanged) {
    await context.github.repos.createCommitStatus(
      context.repoParams({
        sha: headSha,
        context: STATUS_CHECK_CONTEXT,
        state: aggregate.state,
        description: aggregate.description,
        target_url: commentUrl,
      }),
    );
  }
  await sweep;
}

/**
 * Find commit statuses on the head SHA that *we* wrote (matched by creator
 * login = `<botSlug>[bot]`) whose context isn't the dispatcher's aggregate
 * `ha-bot` context, and neutralize them to `success` + "No longer in use".
 * GitHub has no "delete status" API; overwriting is the closest equivalent.
 *
 * Rules emit `statuses` outputs going forward; the single `ha-bot` status is
 * the bot's sole commit-status output. Any other context we own on this
 * commit is therefore from an older deploy.
 */
async function sweepStaleStatusChecks(
  context: RuleContext,
  headSha: string,
  statuses: CommitStatuses,
): Promise<void> {
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
