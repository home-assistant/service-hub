import type { Octokit } from "@octokit/rest";
import type { Env } from "../../../env.js";
import type { RegistryConfig } from "../dispatch.js";
import type { RuleEventOf } from "../event.js";
import { EventType } from "../event.js";
import type { Command } from "../types.js";
import type { Issue } from "./issue.js";
import type { Org } from "./organization.js";
import type { PullRequest } from "./pull-request.js";
import type { Repo } from "./repository.js";

export interface Sender {
  login: string;
  isBot: boolean;
}

/**
 * Which entity kind an event targets. issue_comment can concern either.
 * A lookup interface, like RuleEventMap, so RuleContext<E> stays covariant.
 */
interface TargetMap {
  [EventType.ISSUE_COMMENT_CREATED]: PullRequest | Issue;
  [EventType.ISSUES_LABELED]: Issue;
  [EventType.ISSUES_OPENED]: Issue;
  [EventType.PULL_REQUEST_CLOSED]: PullRequest;
  [EventType.PULL_REQUEST_EDITED]: PullRequest;
  [EventType.PULL_REQUEST_LABELED]: PullRequest;
  [EventType.PULL_REQUEST_OPENED]: PullRequest;
  [EventType.PULL_REQUEST_REOPENED]: PullRequest;
  [EventType.PULL_REQUEST_READY_FOR_REVIEW]: PullRequest;
  [EventType.PULL_REQUEST_REVIEW_SUBMITTED]: PullRequest;
  [EventType.PULL_REQUEST_REVIEW_DISMISSED]: PullRequest;
  [EventType.PULL_REQUEST_SYNCHRONIZE]: PullRequest;
  [EventType.PULL_REQUEST_UNLABELED]: PullRequest;
  [EventType.ON_DEMAND]: PullRequest;
  [EventType.ISSUES_ON_DEMAND]: Issue;
}

export type TargetFor<E extends EventType> = TargetMap[E];

export interface RuleContextParams<E extends EventType> {
  env: Env;
  registry: RegistryConfig;
  github: Octokit;
  event: RuleEventOf<E>;
  sender: Sender;
  repo: Repo;
  org: Org;
  target: TargetFor<E>;
}

/**
 * What a rule handler receives: the event descriptor (what happened), the
 * target entity (lazily-hydrated state), and the repo/org read-models.
 * Replaces raw webhook payload access — only model/from-webhook.ts knows
 * payload shapes.
 */
export class RuleContext<E extends EventType = EventType> {
  readonly env: Env;
  readonly registry: RegistryConfig;
  readonly github: Octokit;
  readonly event: RuleEventOf<E>;
  readonly sender: Sender;
  readonly repo: Repo;
  readonly org: Org;
  readonly target: TargetFor<E>;

  constructor(params: RuleContextParams<E>) {
    this.env = params.env;
    this.registry = params.registry;
    this.github = params.github;
    this.event = params.event;
    this.sender = params.sender;
    this.repo = params.repo;
    this.org = params.org;
    this.target = params.target;
  }

  get eventType(): E {
    return this.event.type as E;
  }

  /** Full `owner/repo` slug of the event's repository. */
  get repository(): string {
    return this.repo.fullName;
  }

  /** The repository's owner (GitHub org or user). */
  get organization(): string {
    return this.repo.organization;
  }

  get senderIsBot(): boolean {
    return this.sender.isBot;
  }

  get number(): number {
    return this.target.number;
  }

  /** Bot's commit-status creator login, e.g. "ha-bot[bot]". */
  get botLogin(): string {
    return `${this.env.BOT_SLUG}[bot]`;
  }

  /** The repo's registered comment commands, for rendering command help. */
  get commands(): readonly Command[] {
    return this.registry.commands?.[this.repository] ?? [];
  }

  repoParams<T extends Record<string, unknown> = Record<string, never>>(
    data?: T,
  ): { owner: string; repo: string } & T {
    return { owner: this.repo.owner, repo: this.repo.name, ...data } as {
      owner: string;
      repo: string;
    } & T;
  }

  issueParams<T extends Record<string, unknown> = Record<string, never>>(
    data?: T,
  ): { issue_number: number; owner: string; repo: string } & T {
    return { issue_number: this.number, ...this.repoParams(data) } as {
      issue_number: number;
      owner: string;
      repo: string;
    } & T;
  }

  pullParams<T extends Record<string, unknown> = Record<string, never>>(
    data?: T,
  ): { pull_number: number; owner: string; repo: string } & T {
    return { pull_number: this.number, ...this.repoParams(data) } as {
      pull_number: number;
      owner: string;
      repo: string;
    } & T;
  }
}
