import type { Command } from "./types.js";
import { updateCommand } from "./update.js";

export interface CommandRegistryConfig {
  repositories: Record<string, Command[]>;
}

export const commandConfig: CommandRegistryConfig = {
  repositories: {
    "home-assistant/core": [updateCommand],
    "justanotherariel/hass_core": [updateCommand],
  },
};

export function findCommand(
  registryConfig: CommandRegistryConfig,
  repoFullName: string,
  name: string,
): Command | undefined {
  const repoCommands = registryConfig.repositories[repoFullName] ?? [];
  return repoCommands.find((cmd) => cmd.name === name);
}
