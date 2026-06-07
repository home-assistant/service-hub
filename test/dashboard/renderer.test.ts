import { describe, expect, it } from "vitest";
import {
  mergeSections,
  parseDashboard,
  renderDashboard,
  SENTINEL,
} from "../../src/dashboard/renderer.js";
import type { DashboardSection } from "../../src/dashboard/types.js";

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

  describe("renderDashboard", () => {
    it("renders failing checks in the main table", () => {
      const result = renderDashboard(sections);

      expect(result).toContain(SENTINEL);
      expect(result).toContain("## Pull Request Checklist");
      expect(result).toContain(":x:");
      expect(result).toContain("Required Labels");
      expect(result).toContain("Missing one of: bugfix, new-feature");
    });

    it("renders passing checks inside a collapsed details block", () => {
      const result = renderDashboard(sections);

      expect(result).toContain("<details>");
      expect(result).toContain("<summary>1 check passed</summary>");
      expect(result).toContain(":white_check_mark:");
      expect(result).toContain("CLA");
      expect(result).toContain("</details>");
    });

    it("pluralizes the passed count", () => {
      const allPass: DashboardSection[] = [
        { id: "a", title: "A", status: "pass", message: "ok" },
        { id: "b", title: "B", status: "pass", message: "ok" },
      ];
      const result = renderDashboard(allPass);

      expect(result).toContain("<summary>2 checks passed</summary>");
      expect(result).not.toContain("| :x:");
    });

    it("omits details block when nothing passes", () => {
      const allFail: DashboardSection[] = [{ id: "a", title: "A", status: "fail", message: "bad" }];
      const result = renderDashboard(allFail);

      expect(result).not.toContain("<details>");
      expect(result).toContain(":x:");
    });

    it("omits main table when everything passes", () => {
      const allPass: DashboardSection[] = [{ id: "a", title: "A", status: "pass", message: "ok" }];
      const result = renderDashboard(allPass);

      // The only table should be inside details
      const beforeDetails = result.split("<details>")[0];
      expect(beforeDetails).not.toContain("| Status |");
    });

    it("treats pending as failing and info as passing", () => {
      const mixed: DashboardSection[] = [
        { id: "a", title: "A", status: "pending", message: "waiting" },
        { id: "b", title: "B", status: "info", message: "fyi" },
      ];
      const result = renderDashboard(mixed);

      // Pending should be in the main table (outside details)
      const beforeDetails = result.split("<details>")[0];
      expect(beforeDetails).toContain(":hourglass:");

      // Info should be inside details
      expect(result).toContain("<summary>1 check passed</summary>");
    });

    it("renders skipped checks in their own details block with a minus icon", () => {
      const mixed: DashboardSection[] = [
        { id: "a", title: "A", status: "pass", message: "ok" },
        { id: "b", title: "B", status: "skip", message: "not applicable" },
        { id: "c", title: "C", status: "skip", message: "label not set" },
      ];
      const result = renderDashboard(mixed);

      expect(result).toContain("<summary>1 check passed</summary>");
      expect(result).toContain("<summary>2 checks skipped</summary>");
      expect(result).toContain(":heavy_minus_sign:");
    });

    it("renders title as link when url is provided", () => {
      const result = renderDashboard([
        {
          id: "docs",
          title: "Documentation",
          status: "info",
          message: "Link provided",
          url: "https://example.com",
        },
      ]);

      expect(result).toContain("[Documentation](https://example.com)");
    });

    it("embeds section data as HTML comments", () => {
      const result = renderDashboard(sections);

      expect(result).toContain('<!-- section:cla:{"id":"cla"');
      expect(result).toContain('<!-- section:required-labels:{"id":"required-labels"');
    });
  });

  describe("parseDashboard", () => {
    it("round-trips through render and parse", () => {
      const rendered = renderDashboard(sections);
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

  describe("mergeSections", () => {
    it("overwrites existing sections by id", () => {
      const existing: DashboardSection[] = [
        { id: "cla", title: "CLA", status: "fail", message: "Not signed" },
        { id: "docs", title: "Docs", status: "pass", message: "OK" },
      ];
      const updates: DashboardSection[] = [
        { id: "cla", title: "CLA", status: "pass", message: "Signed" },
      ];

      const merged = mergeSections(existing, updates);

      expect(merged).toHaveLength(2);
      expect(merged.find((s) => s.id === "cla")?.status).toBe("pass");
      expect(merged.find((s) => s.id === "docs")?.status).toBe("pass");
    });

    it("adds new sections", () => {
      const existing: DashboardSection[] = [
        { id: "cla", title: "CLA", status: "pass", message: "OK" },
      ];
      const updates: DashboardSection[] = [
        { id: "labels", title: "Labels", status: "fail", message: "Missing" },
      ];

      const merged = mergeSections(existing, updates);
      expect(merged).toHaveLength(2);
    });
  });
});
