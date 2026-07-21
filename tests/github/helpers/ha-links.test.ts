import { describe, expect, it } from "vitest";
import {
  extractDocumentationSectionsLinks,
  extractForumLinks,
  extractIntegrationDocumentationLinks,
} from "../../../src/github/helpers/ha-links.js";

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
