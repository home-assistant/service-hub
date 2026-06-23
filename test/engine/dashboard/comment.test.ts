import { describe, expect, it } from "vitest";
import {
  findDashboardCommentId,
  upsertDashboardComment,
} from "../../../src/engine/dashboard/comment.js";
import { SENTINEL } from "../../../src/engine/dashboard/renderer.js";
import type { DashboardSection } from "../../../src/engine/dashboard/types.js";
import { createMockGitHub } from "../../helpers/mock-context.js";

const params = { owner: "home-assistant", repo: "core", issue_number: 1 };

describe("findDashboardCommentId", () => {
  it("finds a comment containing the dashboard sentinel", async () => {
    const github = createMockGitHub();
    github.paginate.mockResolvedValue([
      { id: 1, body: "Regular comment" },
      { id: 2, body: `${SENTINEL}\n## Pull Request Checklist` },
    ]);

    const result = await findDashboardCommentId(github, params);
    expect(result).toEqual({ id: 2, body: expect.stringContaining(SENTINEL) });
  });

  it("returns null when no dashboard comment exists", async () => {
    const github = createMockGitHub();
    github.paginate.mockResolvedValue([{ id: 1, body: "Just a comment" }]);

    const result = await findDashboardCommentId(github, params);
    expect(result).toBeNull();
  });

  it("returns null when no comments exist", async () => {
    const github = createMockGitHub();
    github.paginate.mockResolvedValue([]);

    const result = await findDashboardCommentId(github, params);
    expect(result).toBeNull();
  });
});

describe("upsertDashboardComment", () => {
  const sections: DashboardSection[] = [
    { id: "cla", title: "CLA", status: "pass", message: "Signed" },
  ];

  it("creates a new comment when none exists", async () => {
    const github = createMockGitHub();
    github.paginate.mockResolvedValue([]);

    await upsertDashboardComment(github, params, sections);

    expect(github.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "home-assistant",
        repo: "core",
        issue_number: 1,
        body: expect.stringContaining(SENTINEL),
      }),
    );
  });

  it("updates existing comment with merged sections", async () => {
    const github = createMockGitHub();
    const existingBody = `${SENTINEL}\n<!-- section:old:${JSON.stringify({ id: "old", title: "Old", status: "pass", message: "OK" })} -->`;

    github.paginate.mockResolvedValue([{ id: 42, body: existingBody }]);

    await upsertDashboardComment(github, params, sections);

    expect(github.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 42,
        body: expect.stringContaining("CLA"),
      }),
    );
  });

  it("does nothing when sections array is empty", async () => {
    const github = createMockGitHub();

    await upsertDashboardComment(github, params, []);

    expect(github.paginate).not.toHaveBeenCalled();
    expect(github.issues.createComment).not.toHaveBeenCalled();
  });
});
