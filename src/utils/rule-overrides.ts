import type { DashboardSection } from "../dashboard/types.js";

export interface RuleOverride {
  id: string;
  reason: string;
}

// Matches `<!-- ha-bot:ignore id="x" reason="y" -->` anywhere in the PR body.
// The body of the comment is captured and parsed separately so attribute order
// and surrounding whitespace don't matter.
const OVERRIDE_RE = /<!--\s*ha-bot:ignore\b([\s\S]*?)-->/g;
const ATTR_RE = /(\w+)="([\s\S]*?)"/g;

export function parseOverrides(body: string | null | undefined): RuleOverride[] {
  if (!body) return [];
  const out: RuleOverride[] = [];
  for (const match of body.matchAll(OVERRIDE_RE)) {
    const attrs = new Map<string, string>();
    for (const attr of match[1].matchAll(ATTR_RE)) {
      attrs.set(attr[1], attr[2]);
    }
    const id = attrs.get("id")?.trim();
    const reason = attrs.get("reason")?.trim();
    if (!id || !reason) continue;
    out.push({ id, reason });
  }
  return out;
}

/**
 * Downgrades `fail` and `pending` sections to `skip` when the PR author has
 * waived them via a `<!-- ha-bot:ignore -->` tag in the PR body. The original
 * message is preserved alongside the reason so reviewers can see what was
 * waived and why. `pass`/`info`/`skip` sections are never modified — overrides
 * only silence warnings/errors.
 */
export function applyOverrides(
  sections: DashboardSection[],
  overrides: RuleOverride[],
): DashboardSection[] {
  if (overrides.length === 0) return sections;
  const byId = new Map<string, RuleOverride>();
  for (const o of overrides) byId.set(o.id, o);

  return sections.map((section) => {
    const o = byId.get(section.id);
    if (!o) return section;
    if (section.status !== "fail" && section.status !== "pending") return section;
    return {
      ...section,
      status: "skip",
      message: `${section.message}\nOverride: ${o.reason}`,
    };
  });
}
