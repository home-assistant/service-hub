import type { Octokit } from "@octokit/rest";
import { describe, expect, it } from "vitest";
import { Org } from "../../../src/engine/model/organization.js";
import { Repo } from "../../../src/engine/model/repository.js";
import { createMockGitHub, type MockGitHub } from "../../helpers/mock-context.js";

function asOctokit(mock: MockGitHub): Octokit {
  return mock as unknown as Octokit;
}

describe("Repo", () => {
  it("fetches, decodes, and caches CODEOWNERS content", async () => {
    const github = createMockGitHub();
    github.repos.getContent.mockResolvedValue({
      data: { content: btoa("homeassistant/components/hue/* @balloob") },
    });
    const repo = new Repo(asOctokit(github), {
      owner: "home-assistant",
      name: "core",
      fullName: "home-assistant/core",
    });

    expect(await repo.codeownersContent()).toContain("@balloob");
    await repo.codeownersContent();
    expect(github.repos.getContent).toHaveBeenCalledTimes(1);
  });

  it("returns null when CODEOWNERS is missing", async () => {
    const github = createMockGitHub();
    github.repos.getContent.mockRejectedValue(new Error("404"));
    const repo = new Repo(asOctokit(github), {
      owner: "home-assistant",
      name: "core",
      fullName: "home-assistant/core",
    });

    expect(await repo.codeownersContent()).toBeNull();
  });
});

describe("Org", () => {
  it("expands team refs to member logins and passes users through", async () => {
    const github = createMockGitHub();
    github.teams.listMembersInOrg.mockResolvedValue({
      data: [{ login: "Alice" }, { login: "bob" }],
    });
    const org = new Org(asOctokit(github), "home-assistant");

    const expanded = await org.expandTeams(["@balloob", "@home-assistant/core-team"]);

    expect(expanded).toEqual(["balloob", "alice", "bob"]);
    expect(github.teams.listMembersInOrg).toHaveBeenCalledWith({
      org: "home-assistant",
      team_slug: "core-team",
    });
  });

  it("caches team membership per slug", async () => {
    const github = createMockGitHub();
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });
    const org = new Org(asOctokit(github), "home-assistant");

    await org.expandTeams(["@home-assistant/core-team"]);
    await org.teamMembers("core-team");

    expect(github.teams.listMembersInOrg).toHaveBeenCalledTimes(1);
  });
});
