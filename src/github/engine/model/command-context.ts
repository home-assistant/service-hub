import type { Octokit } from "@octokit/rest";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import type { Env } from "../../../env.js";
import { log } from "../../../log.js";
import type { RegistryConfig } from "../dispatch.js";
import { EventType } from "../event.js";
import { matchCodeOwners, parseCodeOwners } from "./codeowners.js";
import { Org } from "./organization.js";
import { Repo } from "./repository.js";
import {
  RuleContext,
  type RuleContextParams,
  senderFromLogin,
  targetFromPayload,
} from "./rule-context.js";

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
  /** Arguments, each written `"quoted"` on the command line, unquoted here. */
  args: string[];
  /** True when the line carried text that wasn't a well-formed quoted argument. */
  malformed?: boolean;
}

/** Tokenize the rest of a command line into `"quoted"` arguments. */
function parseArgs(rest: string | undefined): Pick<CommandInvocation, "args" | "malformed"> {
  const args: string[] = [];
  let remaining = (rest ?? "").trim();
  while (remaining) {
    const match = remaining.match(/^"([^"]+)"(?:\s+|$)/);
    if (!match) return { args, malformed: true };
    args.push(match[1]);
    remaining = remaining.slice(match[0].length);
  }
  return { args };
}

/**
 * Every command in the comment, one per line that starts with `/<slug>`.
 * Surrounding prose lines are ignored, so commands can be mixed with text
 * and several commands can be stacked in one comment.
 */
export function parseCommands(commentBody: string, slug: string): CommandInvocation[] {
  const re = new RegExp(
    `^/${escapeRegExp(slug)}\\s+([\\w-]+)(?:[^\\S\\n]+(\\S[^\\n]*?))?[^\\S\\n]*$`,
    "gim",
  );
  return [...commentBody.matchAll(re)].map((match) => ({
    name: match[1].toLowerCase(),
    ...parseArgs(match[2]),
  }));
}

export interface CommandContextParams extends RuleContextParams<EventType.ISSUE_COMMENT_CREATED> {
  /** All invocations parsed from the comment, in order of appearance. */
  invocations?: CommandInvocation[];
  /** The invocation this context is scoped to (set via withInvocation). */
  command?: CommandInvocation;
  /** The comment's `author_association` from the webhook payload. */
  senderAssociation?: string;
}

/**
 * What a command handler receives: everything a rule gets for the underlying
 * issue_comment.created event, plus the parsed invocations and permission
 * helpers. `invocations` is empty when the comment addressed the bot but no
 * line parsed — the dispatcher answers those with a 👎 reaction. The
 * dispatcher scopes the context to one invocation at a time (`command`,
 * `args`) via {@link withInvocation}.
 */
export class CommandContext extends RuleContext<EventType.ISSUE_COMMENT_CREATED> {
  readonly invocations: CommandInvocation[];
  readonly command?: CommandInvocation;
  readonly senderAssociation?: string;
  private readonly params: CommandContextParams;

  constructor(params: CommandContextParams) {
    super(params);
    this.params = params;
    this.invocations = params.invocations ?? (params.command ? [params.command] : []);
    this.command = params.command ?? this.invocations[0];
    this.senderAssociation = params.senderAssociation;
  }

  /** Same comment and caches, scoped to a single invocation. */
  withInvocation(invocation: CommandInvocation): CommandContext {
    const derived = new CommandContext({
      ...this.params,
      invocations: this.invocations,
      command: invocation,
    });
    return derived;
  }

  get commentId(): number {
    return this.event.commentId;
  }

  get args(): string[] {
    return this.command?.args ?? [];
  }

  /**
   * Whether the sender owns `domain` per the repo's CODEOWNERS file (cached
   * process-wide); without a domain, the item's single `integration:`-labeled
   * domain. Ambiguous (zero or several labeled integrations), no registered
   * integration path for the repo, or a CODEOWNERS fetch failure all mean no.
   */
  async senderIsCodeOwner(domain?: string): Promise<boolean> {
    const domains = domain
      ? [domain]
      : (await this.target.labels())
          .filter((label) => label.startsWith(INTEGRATION_LABEL_PREFIX))
          .map((label) => label.slice(INTEGRATION_LABEL_PREFIX.length));
    if (domains.length !== 1) return false;

    const integrationPath = this.registry.integrationPaths?.[this.repository];
    if (!integrationPath) return false;

    let content: string | null;
    try {
      content = await this.repo.codeownersContent();
    } catch (err) {
      log.warn("senderIsCodeOwner: CODEOWNERS fetch failed", {
        repository: this.repository,
        error: String(err),
      });
      return false;
    }
    if (!content) return false;

    const match = matchCodeOwners(integrationPath(domains[0]), parseCodeOwners(content));
    if (!match) return false;
    const owners = await this.org.expandTeams(match.owners);
    return owners.includes(this.sender.login.toLowerCase());
  }

  /**
   * Org membership, answered from the payload's `author_association` when it
   * already says MEMBER (no API call); anything else falls back to the API —
   * the field can't prove non-membership (e.g. OWNER on a personal repo).
   */
  async senderIsMember(): Promise<boolean> {
    if (this.senderAssociation === "MEMBER") return true;
    return this.org.hasMember(this.sender.login);
  }
}

/** Build a CommandContext from an issue_comment.created delivery. */
export function commandContextFromWebhook(
  env: Env,
  registry: RegistryConfig,
  github: Octokit,
  payload: IssueCommentCreatedEvent,
): CommandContext {
  const repo = new Repo(github, {
    owner: payload.repository.owner.login,
    name: payload.repository.name,
    fullName: payload.repository.full_name,
    topics: (payload.repository as { topics?: string[] }).topics,
  });

  return new CommandContext({
    env,
    registry,
    github,
    event: {
      type: EventType.ISSUE_COMMENT_CREATED,
      commentId: payload.comment?.id ?? 0,
      commentBody: payload.comment?.body ?? "",
    },
    sender: senderFromLogin(payload.sender?.login ?? "", payload.sender?.type === "Bot"),
    senderAssociation: payload.comment?.author_association,
    repo,
    org: new Org(github, repo.owner),
    target: targetFromPayload(github, payload, repo),
    invocations: parseCommands(payload.comment?.body ?? "", env.COMMAND_SLUG),
  });
}
