/**
 * Webhook capture server for seeding tests/github/manifests fixtures from real
 * GitHub deliveries. Point a tunnel (e.g. smee.io) at
 * http://localhost:8787/github/webhook, perform actions on a repo the bot
 * app is installed on, and every delivery lands in the capture directory as
 * `<event>.<action>-<delivery-id>.json`, already scrubbed and ready to be
 * renamed into tests/github/manifests/fixtures/<repo>/ (the harness derives the
 * event type from the `<event>.<action>` filename prefix).
 *
 * Scrubbing makes payloads independent of the account and fork they were
 * captured from. The source repo is read from the payload's own `repository`
 * block — nothing is hardcoded: `<owner>/<name>` maps onto the canonical
 * repo, the owner becomes a generic `contributor`, and opaque GitHub
 * identifiers keep their shape but lose their content (node_ids become
 * AAA…/aaa…/000… of the same length, numeric ids become 111…).
 *
 * Usage:
 *   pnpm run capture [output-dir]   # capture server
 *   pnpm run scrub                  # re-scrub existing fixtures
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const FIXTURES_ROOT = "tests/github/manifests/fixtures";
const DEFAULT_REPO = "home-assistant/core";
const DEFAULT_USER = "contributor";
const [DEFAULT_OWNER, DEFAULT_NAME] = DEFAULT_REPO.split("/");

/** Keys whose string values are opaque identifiers: keep shape, drop content. */
const OPAQUE_KEYS = new Set(["node_id", "gravatar_id"]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function simplify(value: string): string {
  return value.replace(/[A-Z]/g, "A").replace(/[a-z]/g, "a").replace(/[0-9]/g, "0");
}

/** Replacements derived from the payload's own repository block. */
function replacementsFor(payload: unknown): [RegExp, string][] {
  const repo = (payload as { repository?: { name?: string; owner?: { login?: string } } })
    .repository;
  const owner = repo?.owner?.login;
  const name = repo?.name;

  const out: [RegExp, string][] = [];
  if (owner && name && `${owner}/${name}` !== DEFAULT_REPO) {
    out.push([new RegExp(escapeRe(`${owner}/${name}`), "g"), DEFAULT_REPO]);
  }
  if (owner && owner !== DEFAULT_OWNER && owner !== DEFAULT_USER) {
    out.push([new RegExp(escapeRe(owner), "g"), DEFAULT_USER]);
  }
  if (name && name !== DEFAULT_NAME) {
    out.push([new RegExp(escapeRe(name), "g"), DEFAULT_NAME]);
  }
  out.push([
    /avatars\.githubusercontent\.com\/u\/\d+/g,
    "avatars.githubusercontent.com/u/11111111",
  ]);
  return out;
}

function scrubValue(value: unknown, replacements: [RegExp, string][], key?: string): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const [pattern, replacement] of replacements) out = out.replace(pattern, replacement);
    return key && OPAQUE_KEYS.has(key) ? simplify(out) : out;
  }
  if (typeof value === "number" && key === "id") {
    return Number("1".repeat(String(value).length));
  }
  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry, replacements));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, scrubValue(v, replacements, k)]),
    );
  }
  return value;
}

function scrub(payload: unknown): unknown {
  return scrubValue(payload, replacementsFor(payload));
}

function scrubFixtures() {
  for (const repoDir of readdirSync(FIXTURES_ROOT)) {
    if (repoDir.startsWith("_")) continue;
    const dir = join(FIXTURES_ROOT, repoDir);
    const isPayload = (f: string) =>
      f.endsWith(".json") && !f.endsWith(".state.json") && !f.endsWith(".body.json");
    for (const file of readdirSync(dir).filter(isPayload)) {
      const path = join(dir, file);
      const scrubbed = scrub(JSON.parse(readFileSync(path, "utf8")));
      writeFileSync(path, `${JSON.stringify(scrubbed, null, 2)}\n`);
      console.log(`scrubbed ${path}`);
    }
  }
}

function startCaptureServer(outDir: string) {
  const port = Number(process.env.PORT ?? 8787);
  mkdirSync(outDir, { recursive: true });

  createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method !== "POST" || pathname !== "/github/webhook") {
      response.writeHead(404).end("Not Found");
      return;
    }

    const first = (h: string | string[] | undefined) => (Array.isArray(h) ? h[0] : h);
    const event = first(request.headers["x-github-event"]) ?? "unknown";
    const delivery = first(request.headers["x-github-delivery"]) ?? String(Date.now());

    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");

      let action = "none";
      let content = body;
      try {
        const payload = JSON.parse(body);
        action = payload.action ?? "none";
        content = `${JSON.stringify(scrub(payload), null, 2)}\n`;
      } catch {
        // not JSON; keep "none" and save the raw body for inspection
      }

      const file = join(outDir, `${event}.${action}-${delivery}.json`);
      writeFileSync(file, content);
      console.log(`captured ${event}.${action} -> ${file}`);
      response.end("OK");
    });
  }).listen(port);

  console.log(`capturing webhooks on http://localhost:${port}/github/webhook -> ${outDir}/`);
}

if (process.argv[2] === "scrub") {
  scrubFixtures();
} else {
  startCaptureServer(process.argv[2] ?? join(FIXTURES_ROOT, "_captured"));
}
