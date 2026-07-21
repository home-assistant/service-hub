import { readFileSync } from "node:fs";
import Mustache from "mustache";

/**
 * The comment bodies the bot posts live as mustache templates in
 * `templates/` — the .md files are the source of truth for layout and prose;
 * TypeScript only builds the view models. Loaded once at module init.
 */
export function loadTemplate(name: string): string {
  return readFileSync(new URL(`./templates/${name}.md`, import.meta.url), "utf-8");
}

/**
 * Render with mustache's HTML escaping disabled: the output is markdown, and
 * table-cell escaping is the view builder's job, not the template engine's.
 */
export function renderTemplate(template: string, view: object): string {
  return Mustache.render(template, view, undefined, { escape: String });
}
