import { describe, expect, it } from "vitest";
import { placeholderBody } from "../../../../src/github/engine/status/render.js";
import { findStatusComment } from "../../../../src/github/engine/status-sync.js";
import { createMockGitHub } from "../../helpers/mock-context.js";

const params = { owner: "home-assistant", repo: "core", issue_number: 1 };

describe("findStatusComment", () => {
  it("finds a comment containing the status sentinel", async () => {
    const github = createMockGitHub();
    github.paginate.mockResolvedValue([
      { id: 1, body: "Regular comment" },
      { id: 2, body: placeholderBody() },
    ]);

    const result = await findStatusComment(github, params);
    expect(result).toEqual({ id: 2, body: placeholderBody() });
  });

  it("returns null when no status comment exists", async () => {
    const github = createMockGitHub();
    github.paginate.mockResolvedValue([{ id: 1, body: "Just a comment" }]);

    const result = await findStatusComment(github, params);
    expect(result).toBeNull();
  });

  it("returns null when no comments exist", async () => {
    const github = createMockGitHub();
    github.paginate.mockResolvedValue([]);

    const result = await findStatusComment(github, params);
    expect(result).toBeNull();
  });
});
