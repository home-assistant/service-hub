/**
 * Vendor each manifest repo's live PR template into
 * test/github/manifests/templates/<name>.md, so scenario bodies render from
 * the real thing (test/github/manifests/pr-template.ts) and template changes
 * upstream show up as a diff here.
 *
 * Usage: npm run sync-templates
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TEMPLATES_ROOT = "test/github/manifests/templates";

/** repo slug → template file name (without .md). */
const TEMPLATES: Record<string, string> = {
  "home-assistant/core": "home-assistant-core",
};

mkdirSync(TEMPLATES_ROOT, { recursive: true });
for (const [slug, name] of Object.entries(TEMPLATES)) {
  const url = `https://raw.githubusercontent.com/${slug}/HEAD/.github/PULL_REQUEST_TEMPLATE.md`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const target = join(TEMPLATES_ROOT, `${name}.md`);
  writeFileSync(target, await res.text());
  console.log(`synced ${slug} -> ${target}`);
}
