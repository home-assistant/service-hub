/**
 * Normalize captured webhook fixtures so they're independent of the account
 * and fork they were captured from: the fork slug maps onto the canonical
 * repo, the capturing user becomes a generic `contributor`, and opaque
 * GitHub identifiers keep their shape but lose their content (node_ids
 * become AAA…/aaa…/000… of the same length, numeric ids become 111…).
 *
 * Idempotent — run it after copying new captures into a fixture directory:
 *   bun scripts/scrub-fixtures.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_ROOT = "test/github/manifests/fixtures";

/** Applied to every string value, in order. */
const REPLACEMENTS: [RegExp, string][] = [
  [/justanotherariel\/hass_core/g, "home-assistant/core"],
  [/justanotherariel/g, "contributor"],
  [/hass_core/g, "core"],
  [/avatars\.githubusercontent\.com\/u\/\d+/g, "avatars.githubusercontent.com/u/11111111"],
];

/** Keys whose string values are opaque identifiers: keep shape, drop content. */
const OPAQUE_KEYS = new Set(["node_id", "gravatar_id"]);

function simplify(value: string): string {
  return value.replace(/[A-Z]/g, "A").replace(/[a-z]/g, "a").replace(/[0-9]/g, "0");
}

function scrub(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);
    return key && OPAQUE_KEYS.has(key) ? simplify(out) : out;
  }
  if (typeof value === "number" && key === "id") {
    return Number("1".repeat(String(value).length));
  }
  if (Array.isArray(value)) {
    return value.map((entry) => scrub(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v, k)]));
  }
  return value;
}

for (const repoDir of readdirSync(FIXTURES_ROOT)) {
  if (repoDir.startsWith("_")) continue;
  const dir = join(FIXTURES_ROOT, repoDir);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const path = join(dir, file);
    const scrubbed = scrub(JSON.parse(readFileSync(path, "utf8")));
    writeFileSync(path, `${JSON.stringify(scrubbed, null, 2)}\n`);
    console.log(`scrubbed ${path}`);
  }
}
