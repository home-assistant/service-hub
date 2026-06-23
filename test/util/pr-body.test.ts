import { describe, expect, it } from "vitest";
import {
  extractDocumentationSectionsLinks,
  extractForumLinks,
  extractIntegrationDocumentationLinks,
  extractIssuesOrPullRequestMarkdownLinks,
  extractPullRequestURLLinks,
  extractTasks,
} from "../../src/util/pr-body.js";
import { lastSegment } from "../helpers/mock-context.js";

describe("extractIssuesOrPullRequestMarkdownLinks", () => {
  it("extracts a single markdown-style reference", () => {
    const links = extractIssuesOrPullRequestMarkdownLinks(
      "Docs PR: home-assistant/home-assistant.io#12345",
    );
    expect(links).toEqual([{ owner: "home-assistant", repo: "home-assistant.io", number: 12345 }]);
  });

  it("extracts multiple references", () => {
    const links = extractIssuesOrPullRequestMarkdownLinks(
      "Fixes home-assistant/core#100 and home-assistant/frontend#200",
    );
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ owner: "home-assistant", repo: "core", number: 100 });
    expect(links[1]).toEqual({ owner: "home-assistant", repo: "frontend", number: 200 });
  });

  it("returns empty for null body", () => {
    expect(extractIssuesOrPullRequestMarkdownLinks(null)).toEqual([]);
  });

  it("returns empty when no references found", () => {
    expect(extractIssuesOrPullRequestMarkdownLinks("just some text")).toEqual([]);
  });
});

describe("extractPullRequestURLLinks", () => {
  it("extracts a GitHub PR URL", () => {
    const links = extractPullRequestURLLinks(
      "See https://github.com/home-assistant/home-assistant.io/pull/999",
    );
    expect(links).toEqual([{ owner: "home-assistant", repo: "home-assistant.io", number: 999 }]);
  });

  it("extracts multiple PR URLs", () => {
    const links = extractPullRequestURLLinks(
      "https://github.com/home-assistant/core/pull/1 and https://github.com/esphome/esphome/pull/2",
    );
    expect(links).toHaveLength(2);
  });

  it("returns empty for null body", () => {
    expect(extractPullRequestURLLinks(null)).toEqual([]);
  });

  it("does not match issue URLs", () => {
    expect(extractPullRequestURLLinks("https://github.com/home-assistant/core/issues/123")).toEqual(
      [],
    );
  });
});

describe("extractIntegrationDocumentationLinks", () => {
  it("extracts a www integration link", () => {
    const links = extractIntegrationDocumentationLinks(
      "https://www.home-assistant.io/integrations/hue",
    );
    expect(links).toEqual([
      {
        link: "https://www.home-assistant.io/integrations/hue",
        integration: "hue",
        platform: undefined,
      },
    ]);
  });

  it("extracts integration with platform", () => {
    const links = extractIntegrationDocumentationLinks(
      "https://www.home-assistant.io/integrations/hue.light",
    );
    expect(links).toHaveLength(1);
    expect(links[0].integration).toBe("hue");
    expect(links[0].platform).toBe("light");
  });

  it("extracts links from rc and next subdomains", () => {
    const body = `
      https://rc.home-assistant.io/integrations/mqtt
      https://next.home-assistant.io/integrations/zwave
    `;
    const links = extractIntegrationDocumentationLinks(body);
    expect(links).toHaveLength(2);
    expect(links[0].integration).toBe("mqtt");
    expect(links[1].integration).toBe("zwave");
  });

  it("returns empty for null body", () => {
    expect(extractIntegrationDocumentationLinks(null)).toEqual([]);
  });
});

describe("extractForumLinks", () => {
  it("extracts a community forum link", () => {
    const links = extractForumLinks("See https://community.home-assistant.io/t/some-topic/12345");
    expect(links).toEqual(["https://community.home-assistant.io/t/some-topic/12345"]);
  });

  it("extracts multiple forum links on separate lines", () => {
    const links = extractForumLinks(
      "https://community.home-assistant.io/t/a/1\nhttps://community.home-assistant.io/t/b/2",
    );
    expect(links).toHaveLength(2);
  });

  it("returns empty for null body", () => {
    expect(extractForumLinks(null)).toEqual([]);
  });

  it("returns empty when no forum links found", () => {
    expect(extractForumLinks("not a forum link")).toEqual([]);
  });
});

describe("extractDocumentationSectionsLinks", () => {
  it("extracts section from documentation URL", () => {
    const sections = extractDocumentationSectionsLinks(
      "https://www.home-assistant.io/getting-started/",
    );
    expect(sections).toContain("getting-started");
  });

  it("extracts sections from multiple URLs", () => {
    const sections = extractDocumentationSectionsLinks(
      "https://home-assistant.io/docs/ and https://home-assistant.io/configuration/",
    );
    expect(sections).toContain("docs");
    expect(sections).toContain("configuration");
  });

  it("deduplicates sections", () => {
    const sections = extractDocumentationSectionsLinks(
      "https://home-assistant.io/docs/ and https://home-assistant.io/docs/",
    );
    expect(sections.filter((s) => s === "docs")).toHaveLength(1);
  });

  it("returns empty for null body", () => {
    expect(extractDocumentationSectionsLinks(null)).toEqual([]);
  });
});

describe("extractTasks", () => {
  it("extracts checked tasks", () => {
    const tasks = extractTasks("- [x] Bugfix\n- [ ] New feature");
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({ checked: true, description: "Bugfix" });
    expect(tasks[1]).toEqual({ checked: false, description: "New feature" });
  });

  it("handles various checkbox formats", () => {
    const tasks = extractTasks("- [X] Done\n- [ ] Not done");
    expect(tasks[0].checked).toBe(true);
    expect(tasks[1].checked).toBe(false);
  });

  it("returns empty for null body", () => {
    expect(extractTasks(null)).toEqual([]);
  });

  it("returns empty when no tasks found", () => {
    expect(extractTasks("just regular text")).toEqual([]);
  });

  it("ignores non-task list items", () => {
    expect(extractTasks("- regular list item")).toEqual([]);
  });
});

describe("lastSegment", () => {
  it("returns last path segment", () => {
    expect(lastSegment("a/b/c")).toBe("c");
  });

  it("returns the string itself if no separator", () => {
    expect(lastSegment("filename")).toBe("filename");
  });
});
