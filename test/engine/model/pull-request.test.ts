import { describe, expect, it } from "bun:test";
import type { Octokit } from "@octokit/rest";
import { PullRequest } from "../../../src/engine/model/pull-request.js";
import { createMockGitHub, type MockGitHub } from "../../helpers/mock-context.js";

const REF = { owner: "home-assistant", repo: "core", number: 7 };

function asOctokit(mock: MockGitHub): Octokit {
  return mock as unknown as Octokit;
}

describe("PullRequest entity", () => {
  it("serves seeded fields without any API call", async () => {
    const github = createMockGitHub();
    const pr = new PullRequest(asOctokit(github), REF, {
      labels: ["bugfix"],
      body: "hello",
      draft: false,
      baseRef: "dev",
    });

    expect(await pr.labels()).toEqual(["bugfix"]);
    expect(await pr.body()).toBe("hello");
    expect(await pr.isDraft()).toBe(false);
    expect(await pr.baseRef()).toBe("dev");
    expect(github.pulls.get).not.toHaveBeenCalled();
  });

  it("hydrates unseeded fields with exactly one pulls.get", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({
      data: {
        labels: [{ name: "stale" }],
        body: "fetched",
        merged: true,
        merged_at: "2026-01-01T00:00:00Z",
        head: { sha: "abc" },
        base: { ref: "dev" },
        state: "closed",
        draft: false,
        node_id: "PR_x",
        user: { login: "someone" },
        author_association: "MEMBER",
        assignees: [],
        mergeable_state: "clean",
      },
    });
    const pr = new PullRequest(asOctokit(github), REF);

    // Concurrent reads of different unseeded fields dedupe to one request.
    const [labels, merged, headSha] = await Promise.all([pr.labels(), pr.merged(), pr.headSha()]);
    expect(labels).toEqual(["stale"]);
    expect(merged).toBe(true);
    expect(headSha).toBe("abc");
    expect(github.pulls.get).toHaveBeenCalledTimes(1);
  });

  it("always hydrates mergeableState, even with a full seed", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({ data: { mergeable_state: "dirty" } });
    const pr = new PullRequest(asOctokit(github), REF, { labels: [], body: null, draft: true });

    expect(await pr.mergeableState()).toBe("dirty");
    expect(github.pulls.get).toHaveBeenCalledTimes(1);
  });

  it("withLabels overrides labels but shares all caches", async () => {
    const github = createMockGitHub();
    github.pulls.get.mockResolvedValue({ data: { body: "fetched" } });
    const pr = new PullRequest(asOctokit(github), REF, { labels: ["a"] });

    await pr.body(); // hydrate on the parent
    const derived = pr.withLabels(["a", "b"]);

    expect(await derived.labels()).toEqual(["a", "b"]);
    expect(await pr.labels()).toEqual(["a"]); // parent unchanged
    expect(await derived.body()).toBe("fetched"); // no second fetch
    expect(github.pulls.get).toHaveBeenCalledTimes(1);
  });

  it("fetches files once and derives integration domains from them", async () => {
    const github = createMockGitHub();
    github.paginate.mockResolvedValue([
      { filename: "homeassistant/components/hue/light.py" },
      { filename: "homeassistant/components/hue/sensor.py" },
      { filename: "homeassistant/components/zwave_js/api.py" },
    ]);
    const pr = new PullRequest(asOctokit(github), REF);

    expect(await pr.files()).toHaveLength(3);
    expect(await pr.integrationDomains()).toEqual(["hue", "zwave_js"]);
    expect(github.paginate).toHaveBeenCalledTimes(1);
  });

  it("caches list groups independently of the core group", async () => {
    const github = createMockGitHub();
    github.paginate.mockResolvedValue([]);
    const pr = new PullRequest(asOctokit(github), REF);

    await pr.reviews();
    await pr.reviews();
    await pr.reviewComments();
    await pr.issueComments();

    // reviews (cached), reviewComments, issueComments → 3 paginate calls
    expect(github.paginate).toHaveBeenCalledTimes(3);
    expect(github.pulls.get).not.toHaveBeenCalled();
  });
});
