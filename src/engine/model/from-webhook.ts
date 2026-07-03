import type { Octokit } from "@octokit/rest";
import type {
  IssueCommentCreatedEvent,
  IssuesLabeledEvent,
  PullRequestClosedEvent,
  PullRequestLabeledEvent,
  PullRequestReviewSubmittedEvent,
  PullRequestUnlabeledEvent,
} from "@octokit/webhooks-types";
import type { GetPullRequestResponse } from "../../github/types.js";
import { EventType } from "../../github/types.js";
import type { WebhookEventPayload } from "../context.js";
import type { RuleEvent } from "../event.js";
import { RuleContext } from "../rule-context.js";
import { Issue } from "./issue.js";
import { Org } from "./organization.js";
import { PullRequest, type PullRequestSeed } from "./pull-request.js";
import { Repo } from "./repository.js";

export interface AdapterOptions {
  botSlug: string;
  dryRun?: boolean;
  captureException?: (err: unknown) => void;
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
    case EventType.PULL_REQUEST_REVIEW_SUBMITTED: {
      const p = payload as PullRequestReviewSubmittedEvent;
      return {
        type: eventType,
        reviewState: p.review.state,
        reviewer: p.review.user?.login ?? "",
      };
    }
    case EventType.ISSUE_COMMENT_CREATED: {
      const p = payload as IssueCommentCreatedEvent;
      return { type: eventType, commentId: p.comment.id, commentBody: p.comment.body ?? "" };
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
  const p = payload as {
    pull_request?: PullRequestLike;
    issue?: {
      number: number;
      pull_request?: unknown;
      labels?: ({ name?: string } | string)[] | null;
      body?: string | null;
      user?: { login: string } | null;
      assignees?: ({ login: string } | null)[] | null;
      state?: string;
    };
  };

  const ref = (number: number) => ({ owner: repo.owner, repo: repo.name, number });

  if (p.pull_request) {
    return new PullRequest(
      github,
      ref(p.pull_request.number),
      seedFromPullRequestLike(p.pull_request),
    );
  }

  if (!p.issue) throw new Error("targetFromPayload: payload has neither pull_request nor issue");

  const issue = p.issue;
  const seed = {
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

  // A comment on a PR arrives as an issue payload with a pull_request
  // cross-link; the PR-specific fields (head, base, draft, …) hydrate lazily.
  if (issue.pull_request) {
    return new PullRequest(github, ref(issue.number), seed);
  }
  return new Issue(github, ref(issue.number), seed);
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
