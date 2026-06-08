import type { Octokit } from "@octokit/rest";
import type { GetIssueParams } from "../github/types.js";
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
    const merged = [...byId.values()];

    const { data } = await github.issues.updateComment({
      owner: params.owner,
      repo: params.repo,
      comment_id: existing.id,
      body: renderDashboard(merged),
    });
    return { comment: { id: data.id, url: data.html_url }, sections: merged };
  }
  const { data } = await github.issues.createComment({
    ...params,
    body: renderDashboard(newSections),
  });
  return { comment: { id: data.id, url: data.html_url }, sections: newSections };
}
