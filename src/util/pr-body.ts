import { type ItemRef, slugOf } from "./item-ref.js";

interface Task {
  checked: boolean;
  description: string;
}

function groups(m: RegExpMatchArray): Record<string, string> {
  return m.groups as Record<string, string>;
}

/**
 * Returns every issue/PR reference in `body` — the `owner/repo#123`
 * shorthand plus `https://github.com/owner/repo/pull/123` and
 * `https://github.com/owner/repo/issues/123` URLs — in the order they
 * appear. Deduplicated by (owner, repo, number).
 */
export function extractAllLinks(body: string | null): ItemRef[] {
  const all = [
    ...extractIssuesOrPullRequestMarkdownLinks(body),
    ...extractPullRequestURLLinks(body),
    ...extractIssueURLLinks(body),
  ];
  const seen = new Set<string>();
  const result: ItemRef[] = [];
  for (const link of all) {
    const key = `${slugOf(link)}#${link.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(link);
  }
  return result;
}

function extractIssuesOrPullRequestMarkdownLinks(body: string | null): ItemRef[] {
  if (!body) return [];
  const re = /([\w\-.]+)\/([\w\-.]+)#(\d+)/g;
  return [...body.matchAll(re)].map((m) => ({
    owner: m[1],
    repo: m[2],
    number: Number(m[3]),
  }));
}

function extractPullRequestURLLinks(body: string | null): ItemRef[] {
  if (!body) return [];
  const re = /https:\/\/github\.com\/([\w\-.]+)\/([\w\-.]+)\/pull\/(\d+)/g;
  return [...body.matchAll(re)].map((m) => ({
    owner: m[1],
    repo: m[2],
    number: Number(m[3]),
  }));
}

function extractIssueURLLinks(body: string | null): ItemRef[] {
  if (!body) return [];
  const re = /https:\/\/github\.com\/([\w\-.]+)\/([\w\-.]+)\/issues\/(\d+)/g;
  return [...body.matchAll(re)].map((m) => ({
    owner: m[1],
    repo: m[2],
    number: Number(m[3]),
  }));
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
