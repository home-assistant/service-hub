import type { Octokit } from "@octokit/rest";
import type { GetIssueParams } from "../github/types.js";
import { mergeSections, parseDashboard, renderDashboard, SENTINEL } from "./renderer.js";
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

export async function upsertDashboardComment(
  github: Octokit,
  params: GetIssueParams,
  newSections: DashboardSection[],
): Promise<void> {
  if (newSections.length === 0) {
    return;
  }

  const existing = await findDashboardCommentId(github, params);

  if (existing) {
    const existingSections = parseDashboard(existing.body);
    const merged = mergeSections(existingSections, newSections);
    await github.issues.updateComment({
      owner: params.owner,
      repo: params.repo,
      comment_id: existing.id,
      body: renderDashboard(merged),
    });
  } else {
    await github.issues.createComment({
      ...params,
      body: renderDashboard(newSections),
    });
  }
}
