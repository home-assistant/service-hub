import type { RegistryConfig } from "../engine/dispatch.js";
import type { Command, Rule } from "../engine/types.js";
import { homeAssistantCore } from "./home-assistant-core.js";
import type { RepoManifest } from "./types.js";

/** Every repo the bot acts on. Add a repo by authoring a manifest and listing it here. */
const MANIFESTS: RepoManifest[] = [homeAssistantCore];

/**
 * Boot-time guardrails. The dispatcher silently dedupes rules and commands
 * by name, so a duplicate name would hide a mis-wire; two rules claiming the
 * same dashboard section would fight over it. Fail loudly at module load
 * instead.
 */
function validate(slug: string, rules: Rule[], commands: Command[]): void {
  const names = new Set<string>();
  const sectionOwner = new Map<string, string>();
  for (const rule of rules) {
    if (names.has(rule.name)) {
      throw new Error(`[${slug}] duplicate rule name "${rule.name}"`);
    }
    names.add(rule.name);
    for (const { id } of rule.dashboardSections ?? []) {
      const owner = sectionOwner.get(id);
      if (owner) {
        throw new Error(
          `[${slug}] dashboard section "${id}" claimed by both "${owner}" and "${rule.name}"`,
        );
      }
      sectionOwner.set(id, rule.name);
    }
  }

  const commandNames = new Set<string>();
  for (const command of commands) {
    if (commandNames.has(command.name)) {
      throw new Error(`[${slug}] duplicate command name "${command.name}"`);
    }
    commandNames.add(command.name);
  }
}

function build(): RegistryConfig {
  const repositories: Record<string, Rule[]> = {};
  const commands: Record<string, Command[]> = {};
  for (const manifest of MANIFESTS) {
    validate(manifest.slug, manifest.rules, manifest.commands ?? []);
    for (const slug of [manifest.slug, ...(manifest.aliases ?? [])]) {
      if (repositories[slug]) {
        throw new Error(`Repository "${slug}" is declared by more than one manifest`);
      }
      repositories[slug] = manifest.rules;
      commands[slug] = manifest.commands ?? [];
    }
  }
  return { repositories, commands };
}

/**
 * The dispatcher's registry, assembled from every {@link RepoManifest}. One
 * config serves both PR and issue webhooks — `matchRules` filters each rule
 * by the events it declares.
 */
export const config: RegistryConfig = build();
