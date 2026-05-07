interface IssuePullInfo {
  owner: string;
  repo: string;
  number: number;
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
