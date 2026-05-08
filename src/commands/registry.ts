import { deduplicateByName } from "../utils/deduplicate.js";
import type { Command, CommandContext } from "./types.js";
import { updateCommand } from "./update.js";

export interface CommandRegistryConfig {
  organizations: Record<string, Command[]>;
  repositories: Record<string, Command[]>;
}

export const commandConfig: CommandRegistryConfig = {
  organizations: {
    "home-assistant": [updateCommand],
    esphome: [updateCommand],
  },
  repositories: {},
};

export function findCommand(
  registryConfig: CommandRegistryConfig,
  repoFullName: string,
  organization: string,
  commentBody: string,
): Command | undefined {
  const orgCommands = registryConfig.organizations[organization] ?? [];
  const repoCommands = registryConfig.repositories[repoFullName] ?? [];
  const combined = deduplicateByName([...repoCommands, ...orgCommands]);

  return combined.find((cmd) => cmd.pattern.test(commentBody));
}

export async function dispatchCommand(
  registryConfig: CommandRegistryConfig,
  context: CommandContext,
): Promise<boolean> {
  const repoFullName = `${context.owner}/${context.repo}`;
  const organization = context.owner;

  const command = findCommand(registryConfig, repoFullName, organization, context.commentBody);
  if (!command) return false;

  await command.handle(context);

  // React with thumbs-up to acknowledge
  await context.github.reactions.createForIssueComment({
    owner: context.owner,
    repo: context.repo,
    comment_id: context.commentId,
    content: "+1",
  });

  return true;
}
