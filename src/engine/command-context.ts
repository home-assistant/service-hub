import { fetchIntegrationManifest } from "../util/integration.js";
import type { RegistryConfig } from "./dispatch.js";
import type { EventType } from "./event.js";
import { RuleContext, type RuleContextParams } from "./rule-context.js";

const INTEGRATION_LABEL_PREFIX = "integration: ";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether any line of the comment addresses the bot (`/<slug> …`). */
export function isBotCommand(commentBody: string, slug: string): boolean {
  return new RegExp(`^/${escapeRegExp(slug)}\\b`, "im").test(commentBody);
}

export interface CommandInvocation {
  name: string;
  /** Rest of the line after the name; may contain spaces (titles, labels). */
  args?: string;
}

export function parseCommand(commentBody: string, slug: string): CommandInvocation | undefined {
  const match = commentBody.match(
    new RegExp(`^/${escapeRegExp(slug)}\\s+([\\w-]+)(?:[^\\S\\n]+(\\S[^\\n]*?))?[^\\S\\n]*$`, "im"),
  );
  if (!match) return undefined;
  return { name: match[1].toLowerCase(), ...(match[2] ? { args: match[2] } : {}) };
}

export interface CommandContextParams extends RuleContextParams<EventType.ISSUE_COMMENT_CREATED> {
  command?: CommandInvocation;
  registry: RegistryConfig;
}

/**
 * What a command handler receives: everything a rule gets for the underlying
 * issue_comment.created event, plus the parsed invocation and permission
 * helpers. `command` is undefined when the comment addressed the bot but
 * didn't parse — the dispatcher answers those with a 👎 reaction.
 */
export class CommandContext extends RuleContext<EventType.ISSUE_COMMENT_CREATED> {
  readonly command?: CommandInvocation;
  readonly registry: RegistryConfig;

  constructor(params: CommandContextParams) {
    super(params);
    this.command = params.command;
    this.registry = params.registry;
  }

  get commentId(): number {
    return this.event.commentId;
  }

  get args(): string | undefined {
    return this.command?.args;
  }

  /**
   * Whether the sender is a code owner of `domain`'s integration manifest;
   * without a domain, of the item's single `integration:`-labeled domain.
   * Ambiguous (zero or several labeled integrations) means no.
   */
  async senderIsCodeOwner(domain?: string): Promise<boolean> {
    const domains = domain
      ? [domain]
      : (await this.target.labels())
          .filter((label) => label.startsWith(INTEGRATION_LABEL_PREFIX))
          .map((label) => label.slice(INTEGRATION_LABEL_PREFIX.length));
    if (domains.length !== 1) return false;

    const manifest = await fetchIntegrationManifest(domains[0]);
    if (!manifest?.codeowners?.length) return false;
    const owners = await this.org.expandTeams(manifest.codeowners);
    return owners.includes(this.sender.login.toLowerCase());
  }

  senderIsMember(): Promise<boolean> {
    return this.org.hasMember(this.sender.login);
  }
}
