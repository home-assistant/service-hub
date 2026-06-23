import type { Octokit } from "@octokit/rest";
import type { GetIssueParams } from "../../github/types.js";
import { applyOverrides, type RuleOverride } from "./overrides.js";
import { parseDashboard, renderDashboard, SENTINEL } from "./renderer.js";
import type { DashboardSection } from "./types.js";

export async function findDashboardCommentId(
  github: Octokit,
  params: GetIssueParams,
): Promise<{ id: number; body: string } | null> {
  const comments = await github.paginate(github.issues.listComments, {
    ...params,
    per_page: 100,
  });

  for (const comment of comments) {
    if (comment.body?.includes(SENTINEL)) {
      return { id: comment.id, body: comment.body };
    }
  }

  return null;
}

/**
 * Post a tiny placeholder dashboard comment if none exists yet. Called at the
 * top of effect-application so the dashboard sits above any other comment
 * (mention-code-owners, etc.) the same dispatch will create.
 */
export async function ensureDashboardCommentExists(
  github: Octokit,
  params: GetIssueParams,
): Promise<void> {
  const existing = await findDashboardCommentId(github, params);
  if (existing) return;
  await github.issues.createComment({
    ...params,
    body: `${SENTINEL}\n\n_Evaluating PR rules…_`,
  });
}

export interface UpsertedDashboard {
  comment: { id: number; url: string };
  /** All sections currently on the comment (existing merged with new). */
  sections: DashboardSection[];
}

export async function upsertDashboardComment(
  github: Octokit,
  params: GetIssueParams,
  newSections: DashboardSection[],
  knownSectionIds?: ReadonlySet<string>,
  overrides?: RuleOverride[],
): Promise<UpsertedDashboard | null> {
  if (newSections.length === 0) {
    return null;
  }

  const existing = await findDashboardCommentId(github, params);

  if (existing) {
    let existingSections = parseDashboard(existing.body);

    // Sweep stale sections — anything no live rule claims gets dropped.
    if (knownSectionIds) {
      existingSections = existingSections.filter((s) => knownSectionIds.has(s.id));
    }

    // Merge existing+new by id (new wins)
    const byId = new Map<string, DashboardSection>();
    for (const s of existingSections) byId.set(s.id, s);
    for (const s of newSections) byId.set(s.id, s);

    // Apply overrides by contributor
    const merged = applyOverrides([...byId.values()], overrides ?? []);
    const { data } = await github.issues.updateComment({
      owner: params.owner,
      repo: params.repo,
      comment_id: existing.id,
      body: renderDashboard(merged, `${params.owner}/${params.repo}`),
    });
    return { comment: { id: data.id, url: data.html_url }, sections: merged };
  }
  const sections = applyOverrides(newSections, overrides ?? []);
  const { data } = await github.issues.createComment({
    ...params,
    body: renderDashboard(sections, `${params.owner}/${params.repo}`),
  });
  return { comment: { id: data.id, url: data.html_url }, sections };
}
