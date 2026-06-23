import type { RegistryConfig } from "../engine/dispatch.js";
import type { Rule } from "../engine/types.js";
import { homeAssistantCore } from "./home-assistant-core.js";
import type { RepoManifest } from "./types.js";

/** Every repo the bot acts on. Add a repo by authoring a manifest and listing it here. */
const MANIFESTS: RepoManifest[] = [homeAssistantCore];

/**
 * Boot-time guardrails. The dispatcher silently dedupes checks by name, so a
 * duplicate name would hide a mis-wire; two checks claiming the same dashboard
 * section would fight over it. Fail loudly at module load instead.
 */
function validate(slug: string, checks: Rule[]): void {
  const names = new Set<string>();
  const sectionOwner = new Map<string, string>();
  for (const check of checks) {
    if (names.has(check.name)) {
      throw new Error(`[${slug}] duplicate check name "${check.name}"`);
    }
    names.add(check.name);
    for (const id of check.dashboardSections ?? []) {
      const owner = sectionOwner.get(id);
      if (owner) {
        throw new Error(
          `[${slug}] dashboard section "${id}" claimed by both "${owner}" and "${check.name}"`,
        );
      }
      sectionOwner.set(id, check.name);
    }
  }
}

function build(): RegistryConfig {
  const repositories: Record<string, Rule[]> = {};
  for (const manifest of MANIFESTS) {
    validate(manifest.slug, manifest.checks);
    for (const slug of [manifest.slug, ...(manifest.aliases ?? [])]) {
      if (repositories[slug]) {
        throw new Error(`Repository "${slug}" is declared by more than one manifest`);
      }
      repositories[slug] = manifest.checks;
    }
  }
  return { repositories };
}

/**
 * The dispatcher's registry, assembled from every {@link RepoManifest}. One
 * config serves both PR and issue webhooks — `matchRules` filters each check
 * by the events it declares.
 */
export const config: RegistryConfig = build();
