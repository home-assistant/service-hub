/**
 * Parsers for Home Assistant's own URL conventions (documentation pages,
 * community forum). Org-wide: any HA repo's rules may use these; they are
 * not generic enough for `util/`.
 */

export interface IntegrationDocLink {
  link: string;
  integration: string;
  platform?: string;
}

function groups(m: RegExpMatchArray): Record<string, string> {
  return m.groups as Record<string, string>;
}

export function extractIntegrationDocumentationLinks(body: string | null): IntegrationDocLink[] {
  if (!body) return [];
  const re =
    /(?<link>https:\/\/(?:www|rc|next)\.?home-assistant\.io\/integrations\/(?<integration>\w+)\.?(?<platform>\w+)?)/g;
  return [...body.matchAll(re)]
    .filter((m) => m.groups)
    .map((m) => {
      const g = groups(m);
      return { link: g.link, integration: g.integration, platform: g.platform };
    });
}

export function extractForumLinks(body: string | null): string[] {
  if (!body) return [];
  const re = /(?<link>https:\/\/community\.home-assistant\.io\/t\/.*\/\d+)/g;
  return [...body.matchAll(re)].filter((m) => m.groups).map((m) => groups(m).link);
}

export function extractDocumentationSectionsLinks(body: string | null): string[] {
  if (!body) return [];
  const re = /https:\/\/(?:www\.|rc\.|next\.|)home-assistant\.io\/(.*?)\//g;
  const results = new Set<string>();
  for (const match of body.matchAll(re)) {
    for (const section of match[1].split("/")) {
      results.add(section);
    }
  }
  return [...results];
}
