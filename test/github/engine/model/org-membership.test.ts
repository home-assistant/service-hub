import type { Octokit } from "@octokit/rest";
import { describe, expect, it } from "vitest";
import {
  createOrgReads,
  expandTeamRefs,
  readTeamMembers,
} from "../../../../src/github/engine/model/org-membership.js";
import { createMockGitHub, type MockGitHub } from "../../helpers/mock-context.js";

function asOctokit(mock: MockGitHub): Octokit {
  return mock as unknown as Octokit;
}

describe("expandTeamRefs", () => {
  it("expands team refs to member logins and passes users through", async () => {
    const github = createMockGitHub();
    github.teams.listMembersInOrg.mockResolvedValue({
      data: [{ login: "Alice" }, { login: "bob" }],
    });

    const expanded = await expandTeamRefs(
      asOctokit(github),
      "home-assistant",
      ["@balloob", "@home-assistant/core-team"],
      createOrgReads(),
    );

    expect(expanded).toEqual(["balloob", "alice", "bob"]);
    expect(github.teams.listMembersInOrg).toHaveBeenCalledWith({
      org: "home-assistant",
      team_slug: "core-team",
      per_page: 100,
    });
  });

  it("caches team membership per slug", async () => {
    const github = createMockGitHub();
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });
    const reads = createOrgReads();

    await expandTeamRefs(asOctokit(github), "home-assistant", ["@home-assistant/core-team"], reads);
    await readTeamMembers(asOctokit(github), "home-assistant", "core-team", reads);

    expect(github.teams.listMembersInOrg).toHaveBeenCalledTimes(1);
  });
});
