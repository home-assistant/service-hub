import type { Octokit } from "@octokit/rest";

interface CodeOwnersEntry {
  pattern: string;
  owners: string[];
  line: number;
}

export function parseCodeOwners(content: string): CodeOwnersEntry[] {
  const entries: CodeOwnersEntry[] = [];

  content.split("\n").forEach((entry, idx) => {
    const [code] = entry.split("#");
    const trimmed = code.trim();
    if (trimmed === "") return;
    const [pattern, ...owners] = trimmed.split(/\s+/);
    entries.push({ pattern, owners, line: idx + 1 });
  });

  return entries.reverse();
}

export function matchCodeOwners(
  path: string,
  entries: CodeOwnersEntry[],
): CodeOwnersEntry | undefined {
  for (const entry of entries) {
    // Simple glob matching — covers the patterns used in HA CODEOWNERS
    const regex = globToRegex(entry.pattern);
    if (regex.test(path)) {
      return entry;
    }
  }
}

function globToRegex(pattern: string): RegExp {
  const trailingSlash = pattern.endsWith("/");
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{GLOBSTAR}}/g, ".*")
    .replace(/\?/g, "[^/]");

  if (!regexStr.startsWith("/")) {
    regexStr = `(^|.*/?)${regexStr}`;
  } else {
    regexStr = `^${regexStr.slice(1)}`;
  }

  // Per the CODEOWNERS spec, a pattern ending with `/` matches the directory
  // and everything under it.
  const suffix = trailingSlash ? ".*$" : "$";
  return new RegExp(`${regexStr}${suffix}`);
}

// --- Fetching (the parsing above is pure and used on the result) ---

const CODEOWNERS_TTL_MS = 5 * 60 * 1000;

/**
 * Process-wide CODEOWNERS cache (the file is ~100 KB and rarely changes).
 * Within the TTL the cached copy is served without any request; after it, an
 * If-None-Match revalidation lets GitHub answer 304 — no body, and 304s don't
 * count against the rate limit — unless the file actually changed.
 */
const codeownersByRepo = new Map<
  string,
  { etag: string; content: string | null; fetchedAt: number }
>();

/** Per-dispatch in-flight dedupe slot for the CODEOWNERS fetch. */
export interface CodeownersReads {
  inflight?: Promise<string | null>;
}

export function createCodeownersReads(): CodeownersReads {
  return {};
}

/**
 * Raw CODEOWNERS file content at HEAD, or null if the repo has none. The
 * module cache spans deliveries; `reads` dedupes concurrent fetches within one
 * dispatch. Fetch failures (auth, rate limit, network) propagate to the caller.
 */
export function readCodeowners(
  github: Octokit,
  repo: { owner: string; name: string; fullName: string },
  reads: CodeownersReads,
): Promise<string | null> {
  if (!reads.inflight) {
    reads.inflight = fetchCodeowners(github, repo).catch((err) => {
      reads.inflight = undefined;
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    });
  }
  return reads.inflight;
}

async function fetchCodeowners(
  github: Octokit,
  repo: { owner: string; name: string; fullName: string },
): Promise<string | null> {
  const cached = codeownersByRepo.get(repo.fullName);
  if (cached && Date.now() - cached.fetchedAt < CODEOWNERS_TTL_MS) return cached.content;

  try {
    const res = await github.repos.getContent({
      owner: repo.owner,
      repo: repo.name,
      path: "CODEOWNERS",
      ...(cached ? { headers: { "if-none-match": cached.etag } } : {}),
    });
    const content =
      "content" in res.data
        ? new TextDecoder().decode(Uint8Array.from(atob(res.data.content), (c) => c.charCodeAt(0)))
        : null;
    const etag = (res.headers as { etag?: string } | undefined)?.etag;
    if (etag) {
      codeownersByRepo.set(repo.fullName, { etag, content, fetchedAt: Date.now() });
    }
    return content;
  } catch (err) {
    if ((err as { status?: number }).status === 304 && cached) {
      cached.fetchedAt = Date.now();
      return cached.content;
    }
    throw err;
  }
}
