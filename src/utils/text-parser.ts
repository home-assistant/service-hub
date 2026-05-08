interface IssuePullInfo {
  owner: string;
  repo: string;
  number: number;
}

interface IntegrationDocLink {
  link: string;
  integration: string;
  platform?: string;
}

interface Task {
  checked: boolean;
  description: string;
}

function groups(m: RegExpMatchArray): Record<string, string> {
  return m.groups as Record<string, string>;
}

export function extractIssuesOrPullRequestMarkdownLinks(body: string | null): IssuePullInfo[] {
  if (!body) return [];
  const re = /([\w\-.]+)\/([\w\-.]+)#(\d+)/g;
  return [...body.matchAll(re)].map((m) => ({
    owner: m[1],
    repo: m[2],
    number: Number(m[3]),
  }));
}

export function extractPullRequestURLLinks(body: string | null): IssuePullInfo[] {
  if (!body) return [];
  const re = /https:\/\/github\.com\/([\w\-.]+)\/([\w\-.]+)\/pull\/(\d+)/g;
  return [...body.matchAll(re)].map((m) => ({
    owner: m[1],
    repo: m[2],
    number: Number(m[3]),
  }));
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

export function extractTasks(body: string | null): Task[] {
  if (!body) return [];
  return body
    .split("\n")
    .map((line) => /^-\s?\[\s?(?<checked>\w| |)\s?\] (?<description>.*)/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null && m.groups !== undefined)
    .map((m) => {
      const g = groups(m);
      return { checked: Boolean(g.checked?.trim()), description: g.description };
    });
}
