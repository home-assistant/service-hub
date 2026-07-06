/**
 * Regenerate fixture PR bodies from the vendored PR template
 * (scripts/sync-templates.ts). Each `<fixture>.body.json` describes how the
 * contributor filled the template — which checkboxes they ticked and what
 * prose they wrote under which headings — and the rendered result replaces
 * the fixture payload's pull_request.body. Rendering fails loudly when the
 * template no longer contains a referenced checkbox or heading: exactly the
 * coupling an upstream template change breaks.
 *
 * Usage: bun scripts/update-fixture-bodies.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_ROOT = "test/github/manifests/fixtures";

interface BodyFill {
  /** Checkbox descriptions to tick, matched verbatim against `- [ ] <desc>`. */
  check?: string[];
  /** Prose inserted under `## <heading>` (after its template comment). */
  sections?: Record<string, string>;
}

function renderBody(template: string, fill: BodyFill): string {
  const lines = template.split("\n");

  for (const desc of fill.check ?? []) {
    const matches = lines.flatMap((line, i) => (line.trim() === `- [ ] ${desc}` ? [i] : []));
    if (matches.length !== 1) {
      throw new Error(`checkbox "${desc}" matched ${matches.length} template lines`);
    }
    lines[matches[0]] = lines[matches[0]].replace("- [ ]", "- [x]");
  }

  for (const [heading, text] of Object.entries(fill.sections ?? {})) {
    const at = lines.findIndex((line) => line.trim() === `## ${heading}`);
    if (at === -1) throw new Error(`heading "## ${heading}" not found in template`);
    let insert = at + 1;
    while (insert < lines.length && lines[insert].trim() === "") insert++;
    if (lines[insert]?.trimStart().startsWith("<!--")) {
      while (insert < lines.length && !lines[insert].includes("-->")) insert++;
      insert++;
    }
    lines.splice(insert, 0, "", text);
  }

  return lines.join("\n");
}

for (const repoDir of readdirSync(FIXTURES_ROOT)) {
  if (repoDir.startsWith("_")) continue;
  const dir = join(FIXTURES_ROOT, repoDir);
  const templatePath = join(dir, "_templates", "PULL_REQUEST_TEMPLATE.md");
  if (!existsSync(templatePath)) continue;
  const template = readFileSync(templatePath, "utf8");

  for (const fillFile of readdirSync(dir).filter((f) => f.endsWith(".body.json"))) {
    const fixtureFile = join(dir, fillFile.replace(/\.body\.json$/, ".json"));
    const fill: BodyFill = JSON.parse(readFileSync(join(dir, fillFile), "utf8"));
    const payload = JSON.parse(readFileSync(fixtureFile, "utf8"));
    if (!payload.pull_request) {
      throw new Error(`${fixtureFile} has no pull_request to write a body into`);
    }
    payload.pull_request.body = renderBody(template, fill);
    writeFileSync(fixtureFile, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`rendered ${fixtureFile}`);
  }
}
