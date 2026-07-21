import type { Octokit } from "@octokit/rest";
import { describe, expect, it } from "vitest";
import {
  createCodeownersReads,
  matchCodeOwners,
  parseCodeOwners,
  readCodeowners,
} from "../../../../src/github/engine/model/codeowners.js";
import { createMockGitHub, type MockGitHub } from "../../helpers/mock-context.js";

const REPO = { owner: "home-assistant", name: "core", fullName: "home-assistant/core" };

function asOctokit(mock: MockGitHub): Octokit {
  return mock as unknown as Octokit;
}

describe("parseCodeOwners", () => {
  it("parses a simple CODEOWNERS file", () => {
    const content = `
# Global owners
* @global-owner

homeassistant/components/hue/* @balloob
homeassistant/components/zwave/* @MartinHjelmare
    `.trim();

    const entries = parseCodeOwners(content);
    // Reversed for precedence (last match wins)
    expect(entries).toHaveLength(3);
    expect(entries[0].pattern).toBe("homeassistant/components/zwave/*");
    expect(entries[0].owners).toEqual(["@MartinHjelmare"]);
    expect(entries[1].pattern).toBe("homeassistant/components/hue/*");
    expect(entries[1].owners).toEqual(["@balloob"]);
    expect(entries[2].pattern).toBe("*");
    expect(entries[2].owners).toEqual(["@global-owner"]);
  });

  it("skips blank lines and comments", () => {
    const content = `
# Comment line

homeassistant/components/mqtt/* @emontnemery

# Another comment
homeassistant/components/zha/* @dmulcahey
    `.trim();

    const entries = parseCodeOwners(content);
    expect(entries).toHaveLength(2);
  });

  it("handles multiple owners per pattern", () => {
    const entries = parseCodeOwners("homeassistant/components/hue/* @balloob @frenck");
    expect(entries[0].owners).toEqual(["@balloob", "@frenck"]);
  });

  it("tracks line numbers (1-based)", () => {
    const entries = parseCodeOwners("first @a\nsecond @b");
    // Reversed, so second entry comes first
    expect(entries[0].line).toBe(2);
    expect(entries[1].line).toBe(1);
  });

  it("handles inline comments", () => {
    const entries = parseCodeOwners("homeassistant/components/hue/* @balloob # Hue owner");
    expect(entries[0].pattern).toBe("homeassistant/components/hue/*");
    expect(entries[0].owners).toEqual(["@balloob"]);
  });
});

describe("matchCodeOwners", () => {
  const entries = parseCodeOwners(
    `
homeassistant/components/hue/* @balloob
homeassistant/components/zwave/* @MartinHjelmare
  `.trim(),
  );

  it("matches a path to the correct owner", () => {
    const match = matchCodeOwners("homeassistant/components/hue/light.py", entries);
    expect(match).toBeDefined();
    expect(match?.owners).toEqual(["@balloob"]);
  });

  it("returns undefined for unmatched paths", () => {
    const match = matchCodeOwners("homeassistant/components/unknown/sensor.py", entries);
    expect(match).toBeUndefined();
  });

  it("respects precedence (first match in reversed list)", () => {
    const content = `
* @fallback
homeassistant/components/hue/* @specific
    `.trim();
    const parsed = parseCodeOwners(content);

    const match = matchCodeOwners("homeassistant/components/hue/light.py", parsed);
    expect(match?.owners).toEqual(["@specific"]);
  });

  it("matches glob patterns with wildcard", () => {
    const parsed = parseCodeOwners("homeassistant/components/**/*.py @owner");
    const match = matchCodeOwners("homeassistant/components/hue/light.py", parsed);
    expect(match).toBeDefined();
  });

  it("matches patterns without leading slash", () => {
    const parsed = parseCodeOwners("*.js @js-owner");
    const match = matchCodeOwners("src/utils/helpers.js", parsed);
    expect(match).toBeDefined();
    expect(match?.owners).toEqual(["@js-owner"]);
  });

  it("treats trailing-slash patterns as 'directory and everything under it'", () => {
    // Real HA CODEOWNERS format.
    const parsed = parseCodeOwners("/homeassistant/components/analytics_insights/ @joostlek");

    // Matches any file inside the directory.
    expect(
      matchCodeOwners("homeassistant/components/analytics_insights/config_flow.py", parsed)?.owners,
    ).toEqual(["@joostlek"]);

    // And the synthetic wildcard path mention-code-owners generates.
    expect(
      matchCodeOwners("homeassistant/components/analytics_insights/*", parsed)?.owners,
    ).toEqual(["@joostlek"]);

    // Does not match unrelated paths.
    expect(matchCodeOwners("homeassistant/components/hue/light.py", parsed)).toBeUndefined();
  });
});

describe("readCodeowners", () => {
  it("fetches, decodes, and caches CODEOWNERS content", async () => {
    const github = createMockGitHub();
    github.repos.getContent.mockResolvedValue({
      data: { content: btoa("homeassistant/components/hue/* @balloob") },
    });
    const reads = createCodeownersReads();

    expect(await readCodeowners(asOctokit(github), REPO, reads)).toContain("@balloob");
    await readCodeowners(asOctokit(github), REPO, reads);
    expect(github.repos.getContent).toHaveBeenCalledTimes(1);
  });

  it("returns null when CODEOWNERS is missing", async () => {
    const github = createMockGitHub();
    github.repos.getContent.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );
    expect(await readCodeowners(asOctokit(github), REPO, createCodeownersReads())).toBeNull();
  });

  it("propagates non-404 CODEOWNERS fetch failures", async () => {
    const github = createMockGitHub();
    github.repos.getContent.mockRejectedValue(
      Object.assign(new Error("rate limited"), { status: 403 }),
    );
    await expect(readCodeowners(asOctokit(github), REPO, createCodeownersReads())).rejects.toThrow(
      "rate limited",
    );
  });
});
