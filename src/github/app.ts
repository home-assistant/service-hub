import type { Octokit } from "@octokit/rest";
import { verify } from "@octokit/webhooks-methods";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import type { Env } from "../env.js";
import { isBotCommand } from "./engine/command-context.js";
import { dispatch, dispatchCommand } from "./engine/dispatch.js";
import { evaluateRecentPRs } from "./engine/evaluate.js";
import { EventType } from "./engine/event.js";
import {
  commandContextFromWebhook,
  contextFromWebhook,
  type WebhookEventPayload,
} from "./engine/model/from-webhook.js";
import { config } from "./manifests/index.js";

const CRON_LOOKBACK_OVERLAP_MIN = 2;
const KNOWN_EVENT_TYPES = new Set<string>(Object.values(EventType));

function isPullRequestEvent(event: string): boolean {
  return (
    event === "pull_request" ||
    event === "pull_request_review" ||
    event === "pull_request_review_comment" ||
    event === "pull_request_review_thread"
  );
}

function isIssueEvent(event: string): boolean {
  return event === "issues";
}

async function handleWebhook(env: Env, octokit: Octokit, request: Request): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";

  if (!(await verify(env.GITHUB_WEBHOOK_SECRET, body, signature))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const event = request.headers.get("x-github-event") ?? "";
  const action = (raw.action as string) ?? "";
  const rawEventType = `${event}.${action}`;

  // Skip events without repository scope
  if (!raw.repository || typeof raw.repository !== "object") {
    return new Response("OK");
  }

  const payload = raw as unknown as WebhookEventPayload;
  const known = KNOWN_EVENT_TYPES.has(rawEventType);
  const senderLogin = payload.sender?.login ?? "";
  const ownBotLogin = `${env.BOT_SLUG}[bot]`;
  const selfWebhook = senderLogin.toLowerCase() === ownBotLogin.toLowerCase();

  // Skip self-webhooks and events we don't have a rule for
  if (selfWebhook || !known) return new Response("OK");

  const eventType = rawEventType as EventType;

  // Handle bot commands on PR and issue comments
  if (event === "issue_comment" && action === "created") {
    const commentPayload = payload as IssueCommentCreatedEvent;
    if (isBotCommand(commentPayload.comment.body ?? "", env.COMMAND_SLUG)) {
      const context = commandContextFromWebhook(octokit, commentPayload, {
        botSlug: env.BOT_SLUG,
        dryRun: env.DRY_RUN === "1",
        commandSlug: env.COMMAND_SLUG,
        registry: config,
      });
      await dispatchCommand(context);
      return new Response("OK");
    }
  }

  if (isPullRequestEvent(event) || isIssueEvent(event)) {
    const context = contextFromWebhook(octokit, payload, eventType, {
      botSlug: env.BOT_SLUG,
      dryRun: env.DRY_RUN === "1",
      commandSlug: env.COMMAND_SLUG,
      commands: config.commands?.[payload.repository.full_name] ?? [],
    });
    await dispatch(config, context);
  }

  return new Response("OK");
}

export async function requestHandler(
  env: Env,
  octokit: Octokit,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/github/webhook") {
    return handleWebhook(env, octokit, request);
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return new Response("OK");
  }

  return new Response("Not Found", { status: 404 });
}

export async function scheduledHandler(
  env: Env,
  octokit: Octokit,
  interval_min: number,
): Promise<void> {
  const since = new Date(Date.now() - (interval_min + CRON_LOOKBACK_OVERLAP_MIN) * 60 * 1000);
  const repos = Object.keys(config.repositories);

  await Promise.allSettled(
    repos.map((repo) =>
      evaluateRecentPRs(config, octokit, repo, since, {
        dryRun: env.DRY_RUN === "1",
        botSlug: env.BOT_SLUG,
        commandSlug: env.COMMAND_SLUG,
      }),
    ),
  );
}
