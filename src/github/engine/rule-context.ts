import type { Octokit } from "@octokit/rest";
import type { Organization, Repository } from "../../util/repositories.js";
import type { RuleEventOf } from "./event.js";
import { EventType } from "./event.js";
import type { Issue } from "./model/issue.js";
import type { Org } from "./model/organization.js";
import type { PullRequest } from "./model/pull-request.js";
import type { Repo } from "./model/repository.js";
import type { Command } from "./types.js";

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
  [EventType.PULL_REQUEST_SYNCHRONIZE]: PullRequest;
  [EventType.PULL_REQUEST_UNLABELED]: PullRequest;
  [EventType.ON_DEMAND]: PullRequest;
  [EventType.ISSUES_ON_DEMAND]: Issue;
}

export type TargetFor<E extends EventType> = TargetMap[E];

export interface RuleContextParams<E extends EventType> {
  github: Octokit;
  event: RuleEventOf<E>;
  sender: Sender;
  repo: Repo;
  org: Org;
  target: TargetFor<E>;
  botSlug: string;
  dryRun?: boolean;
  /** Comment-command prefix (`/<slug> <name>`), for rendering command help. */
  commandSlug?: string;
  /** The repo's registered comment commands, for rendering command help. */
  commands?: readonly Command[];
}

/**
 * What a rule handler receives: the event descriptor (what happened), the
 * target entity (lazily-hydrated state), and the repo/org read-models.
 * Replaces raw webhook payload access — only model/from-webhook.ts knows
 * payload shapes.
 */
export class RuleContext<E extends EventType = EventType> {
  readonly github: Octokit;
  readonly event: RuleEventOf<E>;
  readonly sender: Sender;
  readonly repo: Repo;
  readonly org: Org;
  readonly target: TargetFor<E>;
  readonly botSlug: string;
  readonly dryRun: boolean;
  readonly commandSlug: string;
  readonly commands: readonly Command[];

  constructor(params: RuleContextParams<E>) {
    this.github = params.github;
    this.event = params.event;
    this.sender = params.sender;
    this.repo = params.repo;
    this.org = params.org;
    this.target = params.target;
    this.botSlug = params.botSlug;
    this.dryRun = params.dryRun ?? false;
    this.commandSlug = params.commandSlug ?? params.botSlug;
    this.commands = params.commands ?? [];
  }

  get eventType(): E {
    return this.event.type as E;
  }

  get repository(): Repository {
    return this.repo.fullName;
  }

  get organization(): Organization {
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
    return `${this.botSlug}[bot]`;
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

  /**
   * Same dispatch (github, sender, repo, org, options), different event —
   * used by the label loop. Pass a `target` to override entity state (e.g.
   * `pr.withLabels(...)`); defaults to the current target.
   */
  withEvent<F extends EventType>(event: RuleEventOf<F>, target?: TargetFor<F>): RuleContext<F> {
    return new RuleContext<F>({
      github: this.github,
      event,
      sender: this.sender,
      repo: this.repo,
      org: this.org,
      target: target ?? (this.target as unknown as TargetFor<F>),
      botSlug: this.botSlug,
      dryRun: this.dryRun,
      commandSlug: this.commandSlug,
      commands: this.commands,
    });
  }
}
