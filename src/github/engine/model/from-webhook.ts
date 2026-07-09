import type { Octokit } from "@octokit/rest";
import type {
  IssueCommentCreatedEvent,
  IssuesLabeledEvent,
  IssuesOpenedEvent,
  PullRequestClosedEvent,
  PullRequestEditedEvent,
  PullRequestLabeledEvent,
  PullRequestOpenedEvent,
  PullRequestReadyForReviewEvent,
  PullRequestReopenedEvent,
  PullRequestReviewSubmittedEvent,
  PullRequestSynchronizeEvent,
  PullRequestUnlabeledEvent,
} from "@octokit/webhooks-types";
import { CommandContext, parseCommands } from "../command-context.js";
import type { RegistryConfig } from "../dispatch.js";
import { EventType, type RuleEvent } from "../event.js";
import { RuleContext } from "../rule-context.js";
import type { Command } from "../types.js";
import { type GetIssueResponse, Issue, type IssueSeed } from "./issue.js";
import { Org } from "./organization.js";
import { type GetPullRequestResponse, PullRequest, type PullRequestSeed } from "./pull-request.js";
import { Repo } from "./repository.js";

/** Every webhook payload the bot consumes; the adapter's input type. */
export type WebhookEventPayload =
  | IssueCommentCreatedEvent
  | IssuesLabeledEvent
  | IssuesOpenedEvent
  | PullRequestClosedEvent
  | PullRequestEditedEvent
  | PullRequestLabeledEvent
  | PullRequestOpenedEvent
  | PullRequestReadyForReviewEvent
  | PullRequestReopenedEvent
  | PullRequestReviewSubmittedEvent
  | PullRequestSynchronizeEvent
  | PullRequestUnlabeledEvent;

export interface AdapterOptions {
  botSlug: string;
  dryRun?: boolean;
  commandSlug?: string;
  commands?: readonly Command[];
}

/**
 * Structural view over every PR-shaped object GitHub hands us — full webhook
 * PullRequest, the slimmer SimplePullRequest on review events, and the REST
 * pulls.get response. Seeding is presence-based: a field the source lacks
 * stays undefined and the entity hydrates it on first read.
 */
interface PullRequestLike {
  number: number;
  node_id?: string;
  labels?: { name: string }[];
  body?: string | null;
  user?: { login: string } | null;
  author_association?: string;
  assignees?: ({ login: string } | null)[] | null;
  draft?: boolean;
  head?: { sha: string };
  base?: { ref: string };
  merged?: boolean | null;
  merged_at?: string | null;
  state?: string;
}

function seedFromPullRequestLike(pr: PullRequestLike): PullRequestSeed {
  return {
    ...(pr.labels ? { labels: pr.labels.map((l) => l.name) } : {}),
    ...(pr.body !== undefined ? { body: pr.body } : {}),
    ...(pr.user?.login ? { authorLogin: pr.user.login } : {}),
    ...(pr.author_association ? { authorAssociation: pr.author_association } : {}),
    ...(pr.assignees
      ? { assigneeLogins: pr.assignees.flatMap((a) => (a?.login ? [a.login] : [])) }
      : {}),
    ...(typeof pr.draft === "boolean" ? { draft: pr.draft } : {}),
    ...(pr.head?.sha ? { headSha: pr.head.sha } : {}),
    ...(pr.base?.ref ? { baseRef: pr.base.ref } : {}),
    ...(typeof pr.merged === "boolean" ? { merged: pr.merged } : {}),
    ...(pr.merged_at !== undefined ? { mergedAt: pr.merged_at } : {}),
    ...(pr.state === "open" || pr.state === "closed" ? { state: pr.state } : {}),
    ...(pr.node_id ? { nodeId: pr.node_id } : {}),
  };
}

/**
 * Structural view over every issue-shaped object GitHub hands us — the
 * webhook `issue` object and the REST issues.get response. Issue labels are
 * looser than PR labels upstream: entries may be bare strings and object
 * names are optional.
 */
interface IssueLike {
  number: number;
  pull_request?: unknown;
  labels?: ({ name?: string } | string)[] | null;
  body?: string | null;
  user?: { login: string } | null;
  assignees?: ({ login: string } | null)[] | null;
  state?: string;
}

function seedFromIssueLike(issue: IssueLike): IssueSeed {
  return {
    ...(issue.labels
      ? {
          labels: issue.labels.flatMap((l) =>
            typeof l === "string" ? [l] : l?.name ? [l.name] : [],
          ),
        }
      : {}),
    ...(issue.body !== undefined ? { body: issue.body } : {}),
    ...(issue.user?.login ? { authorLogin: issue.user.login } : {}),
    ...(issue.assignees
      ? { assigneeLogins: issue.assignees.flatMap((a) => (a?.login ? [a.login] : [])) }
      : {}),
    ...(issue.state === "open" || issue.state === "closed"
      ? { state: issue.state as "open" | "closed" }
      : {}),
  };
}

function eventFromPayload(payload: WebhookEventPayload, eventType: EventType): RuleEvent {
  switch (eventType) {
    case EventType.PULL_REQUEST_LABELED:
    case EventType.PULL_REQUEST_UNLABELED: {
      const p = payload as PullRequestLabeledEvent | PullRequestUnlabeledEvent;
      return { type: eventType, label: p.label?.name ?? "" };
    }
    case EventType.ISSUES_LABELED: {
      const p = payload as IssuesLabeledEvent;
      return { type: eventType, label: p.label?.name ?? "" };
    }
    case EventType.PULL_REQUEST_CLOSED: {
      const p = payload as PullRequestClosedEvent;
      return { type: eventType, merged: p.pull_request.merged === true };
    }
    case EventType.PULL_REQUEST_REVIEW_SUBMITTED:
    case EventType.PULL_REQUEST_REVIEW_DISMISSED: {
      const p = payload as Partial<PullRequestReviewSubmittedEvent>;
      return {
        type: eventType,
        reviewState: p.review?.state ?? "",
        reviewer: p.review?.user?.login ?? "",
      };
    }
    case EventType.ISSUE_COMMENT_CREATED: {
      const p = payload as Partial<IssueCommentCreatedEvent>;
      return {
        type: eventType,
        commentId: p.comment?.id ?? 0,
        commentBody: p.comment?.body ?? "",
      };
    }
    default:
      return { type: eventType } as RuleEvent;
  }
}

function targetFromPayload(
  github: Octokit,
  payload: WebhookEventPayload,
  repo: Repo,
): PullRequest | Issue {
  const p = payload as { pull_request?: PullRequestLike; issue?: IssueLike };

  const ref = (number: number) => ({ owner: repo.owner, repo: repo.name, number });

  if (p.pull_request) {
    return new PullRequest(
      github,
      ref(p.pull_request.number),
      seedFromPullRequestLike(p.pull_request),
    );
  }

  if (!p.issue) throw new Error("targetFromPayload: payload has neither pull_request nor issue");

  // A comment on a PR arrives as an issue payload with a pull_request
  // cross-link; the PR-specific fields (head, base, draft, …) hydrate lazily.
  if (p.issue.pull_request) {
    return new PullRequest(github, ref(p.issue.number), seedFromIssueLike(p.issue));
  }
  return new Issue(github, ref(p.issue.number), seedFromIssueLike(p.issue));
}

function senderFromLogin(login: string, isBotType: boolean) {
  return { login, isBot: isBotType || login === "homeassistant" };
}

/** Build a RuleContext from a webhook delivery. */
export function contextFromWebhook(
  github: Octokit,
  payload: WebhookEventPayload,
  eventType: EventType,
  opts: AdapterOptions,
): RuleContext {
  const repo = new Repo(github, {
    owner: payload.repository.owner.login,
    name: payload.repository.name,
    fullName: payload.repository.full_name,
    topics: (payload.repository as { topics?: string[] }).topics,
  });

  return new RuleContext({
    github,
    event: eventFromPayload(payload, eventType),
    sender: senderFromLogin(payload.sender?.login ?? "", payload.sender?.type === "Bot"),
    repo,
    org: new Org(github, repo.owner),
    target: targetFromPayload(github, payload, repo),
    ...opts,
  });
}

/** Build a CommandContext from an issue_comment.created delivery. */
export function commandContextFromWebhook(
  github: Octokit,
  payload: IssueCommentCreatedEvent,
  opts: AdapterOptions & { commandSlug: string; registry: RegistryConfig },
): CommandContext {
  const { registry, ...adapterOpts } = opts;
  const repo = new Repo(github, {
    owner: payload.repository.owner.login,
    name: payload.repository.name,
    fullName: payload.repository.full_name,
    topics: (payload.repository as { topics?: string[] }).topics,
  });

  return new CommandContext({
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
    invocations: parseCommands(payload.comment?.body ?? "", opts.commandSlug),
    registry,
    ...adapterOpts,
  });
}

/**
 * Build an ISSUES_ON_DEMAND RuleContext from a REST issues.get response.
 * The response carries no repository object, so the caller supplies owner
 * and repo; topics are unknown without an extra fetch and stay empty.
 */
export function contextFromIssue(
  github: Octokit,
  issue: GetIssueResponse,
  repoRef: { owner: string; repo: string },
  opts: AdapterOptions,
): RuleContext<EventType.ISSUES_ON_DEMAND> {
  const repo = new Repo(github, {
    owner: repoRef.owner,
    name: repoRef.repo,
    fullName: `${repoRef.owner}/${repoRef.repo}`,
  });

  return new RuleContext<EventType.ISSUES_ON_DEMAND>({
    github,
    event: { type: EventType.ISSUES_ON_DEMAND },
    sender: senderFromLogin(issue.user?.login ?? "", issue.user?.type === "Bot"),
    repo,
    org: new Org(github, repo.owner),
    target: new Issue(
      github,
      { owner: repoRef.owner, repo: repoRef.repo, number: issue.number },
      seedFromIssueLike(issue),
    ),
    ...opts,
  });
}

/** Build an ON_DEMAND RuleContext from a REST pulls.get response. */
export function contextFromPullRequest(
  github: Octokit,
  pr: GetPullRequestResponse,
  opts: AdapterOptions,
): RuleContext<EventType.ON_DEMAND> {
  const repoData = pr.base.repo;
  const repo = new Repo(github, {
    owner: repoData.owner.login,
    name: repoData.name,
    fullName: repoData.full_name,
    topics: repoData.topics ?? [],
  });

  return new RuleContext<EventType.ON_DEMAND>({
    github,
    event: { type: EventType.ON_DEMAND },
    sender: senderFromLogin(pr.user?.login ?? "", pr.user?.type === "Bot"),
    repo,
    org: new Org(github, repo.owner),
    target: new PullRequest(
      github,
      { owner: repo.owner, repo: repo.name, number: pr.number },
      seedFromPullRequestLike(pr),
    ),
    ...opts,
  });
}
