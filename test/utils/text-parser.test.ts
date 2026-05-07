import { describe, expect, it } from "vitest";
import {
  extractIssuesOrPullRequestMarkdownLinks,
  extractPullRequestURLLinks,
} from "../../src/utils/text-parser.js";

describe("text-parser", () => {
  describe("extractIssuesOrPullRequestMarkdownLinks", () => {
    it("extracts markdown-style PR references", () => {
      const body = "Docs PR: home-assistant/home-assistant.io#12345";
      const links = extractIssuesOrPullRequestMarkdownLinks(body);
      expect(links).toEqual([
        { owner: "home-assistant", repo: "home-assistant.io", number: 12345 },
      ]);
    });

    it("extracts multiple references", () => {
      const body = "Fixes home-assistant/core#100 and home-assistant/frontend#200";
      const links = extractIssuesOrPullRequestMarkdownLinks(body);
      expect(links).toHaveLength(2);
    });

    it("returns empty for null body", () => {
      expect(extractIssuesOrPullRequestMarkdownLinks(null)).toEqual([]);
    });
  });

  describe("extractPullRequestURLLinks", () => {
    it("extracts GitHub PR URLs", () => {
      const body = "See https://github.com/home-assistant/home-assistant.io/pull/999";
      const links = extractPullRequestURLLinks(body);
      expect(links).toEqual([{ owner: "home-assistant", repo: "home-assistant.io", number: 999 }]);
    });

    it("returns empty for null body", () => {
      expect(extractPullRequestURLLinks(null)).toEqual([]);
    });
  });
});
