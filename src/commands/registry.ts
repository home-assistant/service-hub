import { deduplicateByName } from "../utils/deduplicate.js";
import type { Command } from "./types.js";
import { updateCommand } from "./update.js";

export interface CommandRegistryConfig {
  organizations: Record<string, Command[]>;
  repositories: Record<string, Command[]>;
}

export const commandConfig: CommandRegistryConfig = {
  organizations: {
    // "home-assistant": [updateCommand],
    // esphome: [updateCommand],
  },
  repositories: {
    "home-assistant/core": [updateCommand],
  },
};

export function findCommand(
  registryConfig: CommandRegistryConfig,
  repoFullName: string,
  organization: string,
  name: string,
): Command | undefined {
  const orgCommands = registryConfig.organizations[organization] ?? [];
  const repoCommands = registryConfig.repositories[repoFullName] ?? [];
  const combined = deduplicateByName([...repoCommands, ...orgCommands]);

  return combined.find((cmd) => cmd.name === name);
}
