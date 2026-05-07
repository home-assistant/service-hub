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
    it("renders sections as a markdown table", () => {
      const result = renderDashboard(sections);

      expect(result).toContain(SENTINEL);
      expect(result).toContain("## Pull Request Checklist");
      expect(result).toContain(":white_check_mark:");
      expect(result).toContain(":x:");
      expect(result).toContain("CLA");
      expect(result).toContain("Required Labels");
      expect(result).toContain("All contributors have signed");
      expect(result).toContain("Missing one of: bugfix, new-feature");
    });

    it("embeds section data as HTML comments for parsing", () => {
      const result = renderDashboard(sections);

      expect(result).toContain('<!-- section:cla:{"id":"cla"');
      expect(result).toContain('<!-- section:required-labels:{"id":"required-labels"');
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
