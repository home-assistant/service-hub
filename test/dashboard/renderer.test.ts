import { describe, expect, it } from "vitest";
import { parseDashboard, renderDashboard, SENTINEL } from "../../src/dashboard/renderer.js";
import type { DashboardSection } from "../../src/dashboard/types.js";

const REPO = "home-assistant/core";

describe("dashboard renderer", () => {
  const sections: DashboardSection[] = [
    { id: "cla", title: "CLA", status: "pass", message: "All contributors have signed" },
    {
      id: "required-labels",
      title: "Required Labels",
      status: "fail",
      message: "Missing one of: bugfix, new-feature",
    },
  ];

  /** Everything from the `## Checks` heading onward — used to scope assertions away from the intro. */
  function checksSection(body: string): string {
    return body.split("## Checks")[1] ?? "";
  }

  describe("renderDashboard", () => {
    it("greets contributors with the mapped friendly name", () => {
      const result = renderDashboard(sections, REPO);
      expect(result).toContain("Thanks for contributing to **Home Assistant**");
    });

    it("falls back to the raw repo name when no friendly name is mapped", () => {
      const result = renderDashboard(sections, "unknown-owner/unknown-repo");
      expect(result).toContain("**unknown-owner/unknown-repo**");
    });

    it("collapses dashboard details, override syntax, and bot commands into one details block", () => {
      const result = renderDashboard(sections, REPO);
      expect(result).toContain("More information about this dashboard");
      expect(result).toContain("Skip a check that doesn't apply");
      expect(result).toContain("ha-bot:ignore");
      expect(result).toContain("Bot commands");
      expect(result).toContain("/ha-bot update");
    });

    it("shows a 'Things to address' lead-in when anything is failing", () => {
      const result = renderDashboard(sections, REPO);
      expect(result).toContain("Things to address:");
      expect(result).not.toContain("Everything's in order");
    });

    it("shows a bold 'Everything's in order' lead-in when all checks pass", () => {
      const allPass: DashboardSection[] = [
        { id: "a", title: "A", status: "pass", message: "ok" },
      ];
      const result = renderDashboard(allPass, REPO);
      expect(result).toContain("**✨ Everything's in order!**");
      expect(result).not.toContain("Things to address");
    });

    it("treats pending sections as failing for the lead-in", () => {
      const pending: DashboardSection[] = [
        { id: "a", title: "A", status: "pending", message: "waiting" },
      ];
      const result = renderDashboard(pending, REPO);
      expect(result).toContain("Things to address:");
    });

    it("renders failing checks in the main table", () => {
      const result = renderDashboard(sections, REPO);

      expect(result).toContain(SENTINEL);
      expect(result).toContain("## Checks");
      expect(result).toContain(":x:");
      expect(result).toContain("Required Labels");
      expect(result).toContain("Missing one of: bugfix, new-feature");
    });

    it("renders passing checks inside a collapsed details block", () => {
      const result = renderDashboard(sections, REPO);

      expect(result).toContain("<summary>1 check passed</summary>");
      expect(result).toContain(":white_check_mark:");
      expect(result).toContain("CLA");
    });

    it("combines passed and skipped into one details block, passed first", () => {
      const mixed: DashboardSection[] = [
        { id: "a", title: "A", status: "skip", message: "skipped" },
        { id: "b", title: "B", status: "pass", message: "ok" },
        { id: "c", title: "C", status: "skip", message: "also skipped" },
      ];
      const result = renderDashboard(mixed, REPO);

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
      const onlySkipped: DashboardSection[] = [
        { id: "a", title: "A", status: "fail", message: "broken" },
        { id: "b", title: "B", status: "skip", message: "n/a" },
      ];
      const result = renderDashboard(onlySkipped, REPO);
      expect(result).toContain("<summary>1 check skipped</summary>");
      expect(result).not.toContain("0 checks passed");
    });

    it("pluralizes the passed count", () => {
      const allPass: DashboardSection[] = [
        { id: "a", title: "A", status: "pass", message: "ok" },
        { id: "b", title: "B", status: "pass", message: "ok" },
      ];
      const result = renderDashboard(allPass, REPO);

      expect(result).toContain("<summary>2 checks passed</summary>");
      expect(result).not.toContain("| :x:");
    });

    it("omits the passed details block under ## Checks when nothing passes", () => {
      const allFail: DashboardSection[] = [{ id: "a", title: "A", status: "fail", message: "bad" }];
      const result = renderDashboard(allFail, REPO);

      expect(checksSection(result)).not.toContain("<details>");
      expect(result).toContain(":x:");
    });

    it("omits the main failing table when everything passes", () => {
      const allPass: DashboardSection[] = [{ id: "a", title: "A", status: "pass", message: "ok" }];
      const result = renderDashboard(allPass, REPO);

      const checks = checksSection(result);
      const beforeDetails = checks.split("<details>")[0];
      expect(beforeDetails).not.toContain("| Status |");
    });

    it("renders pending and info rows together in the visible top section", () => {
      const mixed: DashboardSection[] = [
        { id: "a", title: "A", status: "pending", message: "waiting" },
        { id: "b", title: "B", status: "info", message: "fyi" },
      ];
      const result = renderDashboard(mixed, REPO);

      // Both rows live in the visible (non-collapsed) top section under ## Checks.
      const checks = checksSection(result);
      const beforeDetails = checks.split("<details>")[0];
      expect(beforeDetails).toContain(":hourglass:");
      expect(beforeDetails).toContain(":information_source:");

      // No combined "passed/skipped" block because nothing actually passed or skipped.
      expect(checks).not.toContain("<summary>");
    });

    it("shows 'Everything's in order!' even when info-only rows are present", () => {
      const infoOnly: DashboardSection[] = [
        { id: "merge-target", title: "Merge target", status: "info", message: "release branch" },
      ];
      const result = renderDashboard(infoOnly, REPO);
      expect(result).toContain("**✨ Everything's in order!**");
      // The info row still shows in the visible section.
      const checks = checksSection(result);
      expect(checks).toContain(":information_source:");
    });

    it("renders skipped checks with a minus icon inside the combined block", () => {
      const mixed: DashboardSection[] = [
        { id: "a", title: "A", status: "pass", message: "ok" },
        { id: "b", title: "B", status: "skip", message: "not applicable" },
        { id: "c", title: "C", status: "skip", message: "label not set" },
      ];
      const result = renderDashboard(mixed, REPO);

      expect(result).toContain("<summary>1 check passed (2 skipped)</summary>");
      expect(result).toContain(":heavy_minus_sign:");
    });

    it("embeds section data as HTML comments", () => {
      const result = renderDashboard(sections, REPO);

      expect(result).toContain('<!-- section:cla:{"id":"cla"');
      expect(result).toContain('<!-- section:required-labels:{"id":"required-labels"');
    });
  });

  describe("parseDashboard", () => {
    it("round-trips through render and parse", () => {
      const rendered = renderDashboard(sections, REPO);
      const parsed = parseDashboard(rendered);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe("cla");
      expect(parsed[0].status).toBe("pass");
      expect(parsed[1].id).toBe("required-labels");
      expect(parsed[1].status).toBe("fail");
    });

    it("returns empty array for non-dashboard content", () => {
      expect(parseDashboard("just a regular comment")).toEqual([]);
    });
  });
});
