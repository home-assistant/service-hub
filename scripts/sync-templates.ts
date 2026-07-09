/**
 * Vendor each fixture repo's live PR template into
 * test/github/manifests/fixtures/<repo>/_templates/, so fixture bodies can be
 * regenerated from the real thing (scripts/update-fixture-bodies.ts) and
 * template changes upstream show up as a diff here.
 *
 * Usage: npm run sync-templates
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_ROOT = "test/github/manifests/fixtures";

/** The repo a fixture directory's deliveries came from, per its payloads. */
function repoSlug(dir: string): string {
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") || file.endsWith(".state.json") || file.endsWith(".body.json")) {
      continue;
    }
    const payload = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const slug = payload?.repository?.full_name;
    if (slug) return slug;
  }
  throw new Error(`No fixture payload with repository.full_name in ${dir}`);
}

for (const repoDir of readdirSync(FIXTURES_ROOT)) {
  if (repoDir.startsWith("_")) continue;
  const dir = join(FIXTURES_ROOT, repoDir);
  const slug = repoSlug(dir);
  const url = `https://raw.githubusercontent.com/${slug}/HEAD/.github/PULL_REQUEST_TEMPLATE.md`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  mkdirSync(join(dir, "_templates"), { recursive: true });
  const target = join(dir, "_templates", "PULL_REQUEST_TEMPLATE.md");
  writeFileSync(target, await res.text());
  console.log(`synced ${slug} -> ${target}`);
}
