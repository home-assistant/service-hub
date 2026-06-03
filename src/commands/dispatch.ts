import { type CommandRegistryConfig, findCommand } from "./registry.js";
import type { CommandContext } from "./types.js";

const BOT_MENTION_PATTERN = /^@ha-bot\b/im;
const BOT_COMMAND_PATTERN = /^@ha-bot\s+(\S+)\s*$/im;

export function isBotCommand(commentBody: string): boolean {
  return BOT_MENTION_PATTERN.test(commentBody);
}

export function getBotCommand(commentBody: string): string | undefined {
  return commentBody.match(BOT_COMMAND_PATTERN)?.[1]?.toLowerCase();
}

export async function dispatchCommand(
  registryConfig: CommandRegistryConfig,
  context: CommandContext,
): Promise<void> {
  const name = getBotCommand(context.commentBody);
  const command = name
    ? findCommand(registryConfig, `${context.owner}/${context.repo}`, context.owner, name)
    : undefined;

  if (!command) {
    await context.github.reactions.createForIssueComment({
      owner: context.owner,
      repo: context.repo,
      comment_id: context.commentId,
      content: "-1",
    });
    return;
  }

  await command.handle(context);

  // React with thumbs-up to acknowledge
  await context.github.reactions.createForIssueComment({
    owner: context.owner,
    repo: context.repo,
    comment_id: context.commentId,
    content: "+1",
  });
}
