import { type CommandRegistryConfig, findCommand } from "./registry.js";
import type { CommandContext } from "./types.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isBotCommand(commentBody: string, slug: string): boolean {
  return new RegExp(`^/${escapeRegExp(slug)}\\b`, "im").test(commentBody);
}

export function getBotCommand(commentBody: string, slug: string): string | undefined {
  const match = commentBody.match(new RegExp(`^/${escapeRegExp(slug)}\\s+(\\S+)\\s*$`, "im"));
  return match?.[1]?.toLowerCase();
}

export async function dispatchCommand(
  registryConfig: CommandRegistryConfig,
  context: CommandContext,
  slug: string,
): Promise<void> {
  const name = getBotCommand(context.commentBody, slug);
  const command = name
    ? findCommand(registryConfig, `${context.owner}/${context.repo}`, name)
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
