import { describe, expect, it } from "vitest";
import { extractAllLinks, extractTasks } from "../../src/util/pr-body.js";
import { lastSegment } from "../github/helpers/mock-context.js";

describe("extractAllLinks", () => {
  it("extracts a single owner/repo#number shorthand reference", () => {
    const links = extractAllLinks("Docs PR: home-assistant/home-assistant.io#12345");
    expect(links).toEqual([{ owner: "home-assistant", repo: "home-assistant.io", number: 12345 }]);
  });

  it("extracts multiple shorthand references", () => {
    const links = extractAllLinks("Fixes home-assistant/core#100 and home-assistant/frontend#200");
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ owner: "home-assistant", repo: "core", number: 100 });
    expect(links[1]).toEqual({ owner: "home-assistant", repo: "frontend", number: 200 });
  });

  it("extracts a GitHub PR URL", () => {
    const links = extractAllLinks(
      "See https://github.com/home-assistant/home-assistant.io/pull/999",
    );
    expect(links).toEqual([{ owner: "home-assistant", repo: "home-assistant.io", number: 999 }]);
  });

  it("extracts multiple PR URLs", () => {
    const links = extractAllLinks(
      "https://github.com/home-assistant/core/pull/1 and https://github.com/esphome/esphome/pull/2",
    );
    expect(links).toHaveLength(2);
  });

  it("extracts a GitHub issue URL", () => {
    const links = extractAllLinks("Fixes https://github.com/home-assistant/core/issues/123");
    expect(links).toEqual([{ owner: "home-assistant", repo: "core", number: 123 }]);
  });

  it("deduplicates the same item referenced in different forms", () => {
    const links = extractAllLinks(
      "home-assistant/core#77 https://github.com/home-assistant/core/pull/77",
    );
    expect(links).toEqual([{ owner: "home-assistant", repo: "core", number: 77 }]);
  });

  it("returns empty for null body", () => {
    expect(extractAllLinks(null)).toEqual([]);
  });

  it("returns empty when no references found", () => {
    expect(extractAllLinks("just some text")).toEqual([]);
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
