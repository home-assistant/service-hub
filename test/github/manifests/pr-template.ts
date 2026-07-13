import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The real PR templates the scenarios render their bodies from, vendored into
 * templates/<name>.md by `npm run sync-templates`. Rendering matches template
 * text verbatim and fails loudly when a referenced checkbox or heading no
 * longer exists — exactly the coupling an upstream template change breaks.
 */

const TEMPLATES_ROOT = fileURLToPath(new URL("templates", import.meta.url));

export function loadPRTemplate(name: string): string {
  return readFileSync(join(TEMPLATES_ROOT, `${name}.md`), "utf8");
}

export interface TemplateFill {
  /** Checkbox descriptions to tick, matched verbatim against `- [ ] <desc>`. */
  check?: string[];
  /** Prose inserted under `## <heading>` (after its template comment). */
  sections?: Record<string, string>;
}

/** Fill a PR template the way a contributor would: tick boxes, write prose. */
export function renderPRTemplate(template: string, fill: TemplateFill): string {
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
