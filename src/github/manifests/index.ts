import type { Command, RegistryConfig, Rule } from "../engine/types.js";
import { esphome } from "./esphome.js";
import { homeAssistantCore } from "./home-assistant-core/index.js";
import { homeAssistantFrontend } from "./home-assistant-frontend.js";
import { homeAssistantIntents } from "./home-assistant-intents.js";
import { homeAssistantIo } from "./home-assistant-io/index.js";
import { homeAssistantOrgManifests } from "./home-assistant-org.js";
import { homeAssistantSupervisor } from "./home-assistant-supervisor/index.js";
import type { RepoManifest } from "./types.js";

/** Every repo the bot acts on. Add a repo by authoring a manifest and listing it here. */
const MANIFESTS: RepoManifest[] = [
  homeAssistantCore,
  homeAssistantFrontend,
  homeAssistantIntents,
  homeAssistantIo,
  homeAssistantSupervisor,
  ...homeAssistantOrgManifests,
  esphome,
];

/**
 * Boot-time guardrails. The dispatcher silently dedupes rules and commands
 * by name, so a duplicate name would hide a mis-wire; two rules claiming the
 * same status section would fight over it. Fail loudly at module load
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
    for (const { id } of rule.statusSections ?? []) {
      const owner = sectionOwner.get(id);
      if (owner) {
        throw new Error(
          `[${slug}] status section "${id}" claimed by both "${owner}" and "${rule.name}"`,
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
  const integrationPaths: Record<string, (domain: string) => string> = {};
  for (const manifest of MANIFESTS) {
    validate(manifest.slug, manifest.rules, manifest.commands ?? []);
    for (const slug of [manifest.slug, ...(manifest.aliases ?? [])]) {
      if (repositories[slug]) {
        throw new Error(`Repository "${slug}" is declared by more than one manifest`);
      }
      repositories[slug] = manifest.rules;
      commands[slug] = manifest.commands ?? [];
      if (manifest.integrationPath) integrationPaths[slug] = manifest.integrationPath;
    }
  }
  return { repositories, commands, integrationPaths };
}

/**
 * The dispatcher's registry, assembled from every {@link RepoManifest}. One
 * config serves both PR and issue webhooks — `matchRules` filters each rule
 * by the events it declares.
 */
export const registryConfig: RegistryConfig = build();
