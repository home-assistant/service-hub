import type { Octokit } from "@octokit/rest";
import { verify } from "@octokit/webhooks-methods";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import type { Env } from "../env.js";
import { log } from "../log.js";
import { createOctokit, type GitHubAppConfig } from "./app.js";
import { isBotCommand } from "./engine/command-context.js";
import type { RegistryConfig } from "./engine/dispatch.js";
import { dispatch, dispatchCommand } from "./engine/dispatch.js";
import { evaluateRecentPRs } from "./engine/evaluate.js";
import { EventType } from "./engine/event.js";
import {
  commandContextFromWebhook,
  contextFromWebhook,
  type WebhookEventPayload,
} from "./engine/model/from-webhook.js";
import { config } from "./manifests/index.js";

const CRON_LOOKBACK_MINUTES = 10;
const KNOWN_EVENT_TYPES = new Set<string>(Object.values(EventType));

function isDryRun(env: Env): boolean {
  return env.DRY_RUN === "1";
}

function githubConfig(env: Env): GitHubAppConfig {
  return {
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_PRIVATE_KEY,
    installationId: env.GITHUB_INSTALLATION_ID,
  };
}

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

export interface BotDeps {
  config: RegistryConfig;
  createOctokit: (env: Env) => Octokit;
}

/** A standalone request handler: takes a Fetch `Request`, returns a `Response`. */
export type RequestHandler = (request: Request, env: Env) => Promise<Response>;

async function handleWebhook(deps: BotDeps, request: Request, env: Env): Promise<Response> {
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

  log.info("webhook", {
    webhook: rawEventType,
    repo: payload.repository.full_name,
    sender: payload.sender?.login,
    number:
      ("pull_request" in payload && payload.pull_request?.number) ||
      ("issue" in payload && payload.issue?.number) ||
      undefined,
    delivery: request.headers.get("x-github-delivery"),
    ...(selfWebhook ? { ignored: "self-webhook" } : known ? {} : { ignored: "unknown event type" }),
  });

  // Skip self-webhooks and events we don't have a rule for
  if (selfWebhook || !known) return new Response("OK");

  const eventType = rawEventType as EventType;
  const octokit = deps.createOctokit(env);

  // Handle bot commands on PR and issue comments
  if (event === "issue_comment" && action === "created") {
    const commentPayload = payload as IssueCommentCreatedEvent;
    if (isBotCommand(commentPayload.comment.body ?? "", env.COMMAND_SLUG)) {
      const context = commandContextFromWebhook(octokit, commentPayload, {
        botSlug: env.BOT_SLUG,
        dryRun: isDryRun(env),
        commandSlug: env.COMMAND_SLUG,
        registry: deps.config,
      });
      await dispatchCommand(context);
      return new Response("OK");
    }
  }

  if (isPullRequestEvent(event) || isIssueEvent(event)) {
    const context = contextFromWebhook(octokit, payload, eventType, {
      botSlug: env.BOT_SLUG,
      dryRun: isDryRun(env),
      commandSlug: env.COMMAND_SLUG,
      commands: deps.config.commands?.[payload.repository.full_name] ?? [],
    });
    await dispatch(deps.config, context);
  }

  return new Response("OK");
}

export function createBotApp(deps: BotDeps): RequestHandler {
  return async (request, env) => {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("OK");
    }

    if (request.method === "POST" && url.pathname === "/github/webhook") {
      return handleWebhook(deps, request, env);
    }

    return new Response("Not Found", { status: 404 });
  };
}

export function createScheduledHandler(deps: BotDeps): (env: Env) => Promise<void> {
  return async (env) => {
    const octokit = deps.createOctokit(env);
    const since = new Date(Date.now() - CRON_LOOKBACK_MINUTES * 60 * 1000);
    const dryRun = isDryRun(env);

    const repos = Object.keys(deps.config.repositories);

    await Promise.allSettled(
      repos.map((repo) =>
        evaluateRecentPRs(deps.config, octokit, repo, since, {
          dryRun,
          botSlug: env.BOT_SLUG,
          commandSlug: env.COMMAND_SLUG,
        }),
      ),
    );
  };
}

export const defaultDeps: BotDeps = {
  config,
  createOctokit: (env) => createOctokit(githubConfig(env)),
};
