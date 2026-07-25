import { describe, expect, it } from "vitest";
import {
  displaySection,
  isStatusComment,
  parseSections,
  parseState,
  placeholderBody,
  renderStatus,
} from "../../../../src/github/engine/status/render.js";
import type { StatusSection } from "../../../../src/github/engine/status/types.js";

const REPO = "home-assistant/core";

describe("status renderer", () => {
  const sections: StatusSection[] = [
    { id: "cla", title: "CLA", status: "pass", message: "All contributors have signed" },
    {
      id: "required-labels",
      title: "Required Labels",
      status: "fail",
      message: "Missing one of: bugfix, new-feature",
    },
  ];

  /** The `## Checks` block — scoped away from the intro, blocks, and footer. */
  function checksSection(body: string): string {
    const afterHeading = body.split("## Checks")[1] ?? "";
    return afterHeading.split("\n---\n")[0];
  }

  describe("renderStatus", () => {
    it("greets contributors with the mapped friendly name", () => {
      const result = renderStatus(sections, REPO);
      expect(result).toContain("Thanks for contributing to **Home Assistant**");
    });

    it("falls back to the raw repo name when no friendly name is mapped", () => {
      const result = renderStatus(sections, "unknown-owner/unknown-repo");
      expect(result).toContain("**unknown-owner/unknown-repo**");
    });

    it("collapses dashboard details, waiver syntax, and bot commands into one details block", () => {
      const result = renderStatus(sections, REPO, "pull_request", {
        commands: [
          {
            name: "update",
            description: "Re-runs the bot's checks.",
            permission: "none",
          },
          {
            name: "mark-draft",
            description: "Marks the pull request as draft.",
            permission: "code_owner",
            scope: "pull_request",
          },
          {
            name: "issue-only",
            description: "Issue-scoped command.",
            permission: "none",
            scope: "issue",
          },
        ],
      });
      expect(result).toContain("More information about this dashboard");
      expect(result).toContain("Skip a check that doesn't apply");
      expect(result).toContain('ignore "<check name>" "<reason>"');
      expect(result).toContain('unignore "<check name>"');
      expect(result).toContain("Bot commands");
      expect(result).toContain("- `update` — Re-runs the bot's checks.");
      expect(result).toContain("- `mark-draft` — Marks the pull request as draft. *(code owners)*");
      // Issue-scoped commands don't show on the PR dashboard.
      expect(result).not.toContain("issue-only");
    });

    it("shows a 'Things to address' lead-in when anything is failing", () => {
      const result = renderStatus(sections, REPO);
      expect(result).toContain("Things to address:");
      expect(result).not.toContain("Everything's in order");
    });

    it("shows a bold 'Everything's in order' lead-in when all checks pass", () => {
      const allPass: StatusSection[] = [{ id: "a", title: "A", status: "pass", message: "ok" }];
      const result = renderStatus(allPass, REPO);
      expect(result).toContain("**✨ Everything's in order!**");
      expect(result).not.toContain("Things to address");
    });

    it("shows pending sections in the main table without the 'Things to address' lead-in", () => {
      const pending: StatusSection[] = [
        { id: "a", title: "A", status: "pending", message: "waiting" },
      ];
      const result = renderStatus(pending, REPO);
      expect(result).not.toContain("Things to address");
      expect(result).toContain("| :hourglass: | A | waiting |");
    });

    it("renders failing checks in the main table", () => {
      const result = renderStatus(sections, REPO);

      expect(isStatusComment(result)).toBe(true);
      expect(result).toContain("## Checks");
      expect(result).toContain(":x:");
      expect(result).toContain("Required Labels");
      expect(result).toContain("Missing one of: bugfix, new-feature");
    });

    it("renders a waived failing check as a warning row with the reason", () => {
      const waived: StatusSection[] = [
        {
          id: "merge-conflict",
          title: "Merge conflicts",
          status: "fail",
          message: "Branch has merge conflicts.",
          ignored: { reason: "Will rebase before merge" },
        },
      ];
      const result = renderStatus(waived, REPO);

      // Presented as a warning, original message and reason both visible.
      expect(result).toContain(
        "| :warning: | Merge conflicts | Branch has merge conflicts.<br>Ignored: Will rebase before merge |",
      );
      expect(result).not.toContain("Things to address");
      // The persisted section state keeps the raw status and the waiver.
      expect(parseState(result).sections).toEqual(waived);
    });

    it("renders passing checks inside a collapsed details block", () => {
      const result = renderStatus(sections, REPO);

      expect(result).toContain("<summary>1 check passed</summary>");
      expect(result).toContain(":white_check_mark:");
      expect(result).toContain("CLA");
    });

    it("combines passed and skipped into one details block, passed first", () => {
      const mixed: StatusSection[] = [
        { id: "a", title: "A", status: "skip", message: "skipped" },
        { id: "b", title: "B", status: "pass", message: "ok" },
        { id: "c", title: "C", status: "skip", message: "also skipped" },
      ];
      const result = renderStatus(mixed, REPO);

      expect(result).toContain("<summary>1 check passed (2 skipped)</summary>");
      // Two `<details>` total — one for the intro "Skip a check or run commands",
      // plus the combined passed+skipped block under ## Checks.
      const detailsCount = result.match(/<details>/g)?.length ?? 0;
      expect(detailsCount).toBe(2);

      // Passed row appears before skipped rows.
      const passIdx = result.indexOf(":white_check_mark:");
      const firstSkipIdx = result.indexOf(":heavy_minus_sign:");
      expect(passIdx).toBeGreaterThan(0);
      expect(passIdx).toBeLessThan(firstSkipIdx);
    });

    it("shows only skipped count when nothing passes but something is skipped", () => {
      const onlySkipped: StatusSection[] = [
        { id: "a", title: "A", status: "fail", message: "broken" },
        { id: "b", title: "B", status: "skip", message: "n/a" },
      ];
      const result = renderStatus(onlySkipped, REPO);
      expect(result).toContain("<summary>1 check skipped</summary>");
      expect(result).not.toContain("0 checks passed");
    });

    it("pluralizes the passed count", () => {
      const allPass: StatusSection[] = [
        { id: "a", title: "A", status: "pass", message: "ok" },
        { id: "b", title: "B", status: "pass", message: "ok" },
      ];
      const result = renderStatus(allPass, REPO);

      expect(result).toContain("<summary>2 checks passed</summary>");
      expect(result).not.toContain("| :x:");
    });

    it("omits the passed details block under ## Checks when nothing passes", () => {
      const allFail: StatusSection[] = [{ id: "a", title: "A", status: "fail", message: "bad" }];
      const result = renderStatus(allFail, REPO);

      expect(checksSection(result)).not.toContain("<details>");
      expect(result).toContain(":x:");
    });

    it("omits the main failing table when everything passes", () => {
      const allPass: StatusSection[] = [{ id: "a", title: "A", status: "pass", message: "ok" }];
      const result = renderStatus(allPass, REPO);

      const checks = checksSection(result);
      const beforeDetails = checks.split("<details>")[0];
      expect(beforeDetails).not.toContain("| Status |");
    });

    it("renders pending and warn rows together in the visible top section", () => {
      const mixed: StatusSection[] = [
        { id: "a", title: "A", status: "pending", message: "waiting" },
        { id: "b", title: "B", status: "warn", message: "careful" },
      ];
      const result = renderStatus(mixed, REPO);

      // Both rows live in the visible (non-collapsed) top section under ## Checks.
      const checks = checksSection(result);
      const beforeDetails = checks.split("<details>")[0];
      expect(beforeDetails).toContain(":hourglass:");
      expect(beforeDetails).toContain(":warning:");

      // No combined "passed/skipped" block because nothing actually passed or skipped.
      expect(checks).not.toContain("<summary>");
    });

    it("renders template blocks at their fixed spot, outside the checks table", () => {
      const sections: StatusSection[] = [{ id: "a", title: "A", status: "pass", message: "ok" }];
      const result = renderStatus(sections, REPO, "issue", {
        blocks: {
          "integration-links": {
            domains: [
              { domain: "hue", docs: "https://d", source: "https://s", issues: "https://i" },
            ],
          },
        },
      });
      expect(result).toContain("**Integration links**");
      expect(result).toContain(
        "- `hue`: [documentation](https://d) · [source](https://s) · [known issues](https://i)",
      );
      // A block is not a check: it never renders as a table row.
      expect(result).not.toMatch(/\|.*Integration links/);
      // Block state round-trips through the persisted blob.
      expect(parseState(result).blocks["integration-links"]).toBeDefined();
    });

    it("omits the ## Checks block entirely when only blocks are visible", () => {
      const result = renderStatus([], REPO, "issue", {
        blocks: { "reporting-guidance": { paragraphs: ["First advice.", "Second advice."] } },
      });
      expect(result).not.toContain("## Checks");
      expect(result).toContain("**Reporting guidance**");
      // Paragraphs render on consecutive lines (single newlines — GitHub
      // comments treat those as line breaks).
      expect(result).toContain("First advice.\nSecond advice.");
    });

    it("hidden blocks leave no trace in body or state", () => {
      const result = renderStatus([], REPO, "issue", { blocks: {} });
      expect(result).not.toContain("Reporting guidance");
      expect(parseState(result).blocks).toEqual({});
    });

    it("renders skipped checks with a minus icon inside the combined block", () => {
      const mixed: StatusSection[] = [
        { id: "a", title: "A", status: "pass", message: "ok" },
        { id: "b", title: "B", status: "skip", message: "not applicable" },
        { id: "c", title: "C", status: "skip", message: "label not set" },
      ];
      const result = renderStatus(mixed, REPO);

      expect(result).toContain("<summary>1 check passed (2 skipped)</summary>");
      expect(result).toContain(":heavy_minus_sign:");
    });

    it("embeds all state as a single JSON blob", () => {
      const result = renderStatus(sections, REPO);

      expect(result).toContain("<!-- ha-bot-state:");
      // Exactly one persistence marker, no per-section markers.
      expect(result.match(/<!-- ha-bot-state:/g)).toHaveLength(1);
      expect(result).not.toContain("<!-- section:");
      const parsed = parseState(result);
      expect(parsed.sections.map((s) => s.id)).toEqual(["cla", "required-labels"]);
    });

    it("escapes `>` so a section message can't close the comment early", () => {
      const result = renderStatus(
        [{ id: "x", title: "X", status: "fail", message: "value --> broken" }],
        REPO,
      );
      // The raw blob must not contain a literal `-->` from the message.
      const tail = result.slice(result.indexOf("<!-- ha-bot-state:"));
      expect(tail.match(/-->/g)).toHaveLength(1); // only the marker's own suffix
      expect(parseState(result).sections[0].message).toBe("value --> broken");
    });
  });

  describe("displaySection", () => {
    it("leaves un-waived and non-blocking sections untouched", () => {
      const pass: StatusSection = { id: "a", title: "A", status: "pass", message: "ok" };
      expect(displaySection(pass)).toBe(pass);
      const waivedPass: StatusSection = { ...pass, ignored: { reason: "r" } };
      expect(displaySection(waivedPass)).toBe(waivedPass);
    });

    it("projects waived fail and pending sections to warn", () => {
      const fail: StatusSection = {
        id: "a",
        title: "A",
        status: "fail",
        message: "broken",
        ignored: { reason: "by-design" },
      };
      expect(displaySection(fail)).toMatchObject({
        status: "warn",
        message: "broken\nIgnored: by-design",
      });
      const pending: StatusSection = { ...fail, status: "pending", message: "wait" };
      expect(displaySection(pending)).toMatchObject({
        status: "warn",
        message: "wait\nIgnored: by-design",
      });
    });
  });

  describe("parseState", () => {
    it("round-trips sections through render and parse", () => {
      const parsed = parseState(renderStatus(sections, REPO));

      expect(parsed.sections).toHaveLength(2);
      expect(parsed.sections[0].id).toBe("cla");
      expect(parsed.sections[0].status).toBe("pass");
      expect(parsed.sections[1].id).toBe("required-labels");
      expect(parsed.sections[1].status).toBe("fail");
    });

    it("returns an empty state for non-dashboard content", () => {
      expect(parseState("just a regular comment")).toEqual({
        version: 1,
        sections: [],
        blocks: {},
        data: {},
      });
    });

    it("falls back to legacy per-marker comments", () => {
      const legacy =
        '<!-- ha-bot-dashboard -->\n<!-- section:cla:{"id":"cla","title":"CLA","status":"pass","message":"ok"} -->';
      expect(parseState(legacy).sections).toEqual([
        { id: "cla", title: "CLA", status: "pass", message: "ok" },
      ]);
      // parseSections is still the legacy reader behind the fallback.
      expect(parseSections("just a regular comment")).toEqual([]);
    });
  });

  describe("placeholder", () => {
    it("is recognized as a status comment and carries no sections", () => {
      expect(isStatusComment(placeholderBody())).toBe(true);
      expect(parseState(placeholderBody()).sections).toEqual([]);
    });
  });
});
