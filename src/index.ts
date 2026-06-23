import type { Octokit } from "@octokit/rest";
import { verify } from "@octokit/webhooks-methods";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { withSentry } from "@sentry/cloudflare";
import { Hono } from "hono";
import { dispatchCommand, isBotCommand } from "./commands/dispatch.js";
import type { CommandRegistryConfig } from "./commands/registry.js";
import { commandConfig } from "./commands/registry.js";
import { WebhookContext, type WebhookEventPayload } from "./engine/context.js";
import type { RegistryConfig } from "./engine/dispatch.js";
import { dispatch } from "./engine/dispatch.js";
import { evaluateRecentPRs } from "./engine/evaluate.js";
import type { Env } from "./env.js";
import { createOctokit, type GitHubAppConfig } from "./github/app.js";
import { EventType } from "./github/types.js";
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
  commandConfig: CommandRegistryConfig;
  createOctokit: (env: Env) => Octokit;
}

export function createBotApp(deps: BotDeps): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/health", (c) => c.text("OK"));

  app.post("/github/webhook", async (c) => {
    const body = await c.req.text();
    const signature = c.req.header("x-hub-signature-256") ?? "";

    if (!(await verify(c.env.GITHUB_WEBHOOK_SECRET, body, signature))) {
      return c.text("Invalid signature", 401);
    }

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(body);
    } catch {
      return c.text("Invalid JSON", 400);
    }
    const event = c.req.header("x-github-event") ?? "";
    const action = (raw.action as string) ?? "";
    const rawEventType = `${event}.${action}`;

    // Skip events without repository scope
    if (!raw.repository || typeof raw.repository !== "object") {
      return c.text("OK", 200);
    }

    const payload = raw as unknown as WebhookEventPayload;
    const known = KNOWN_EVENT_TYPES.has(rawEventType);
    const senderLogin = payload.sender?.login ?? "";
    const ownBotLogin = `${c.env.BOT_SLUG}[bot]`;
    const selfWebhook = senderLogin.toLowerCase() === ownBotLogin.toLowerCase();

    console.log(
      JSON.stringify({
        webhook: rawEventType,
        repo: payload.repository.full_name,
        sender: payload.sender?.login,
        number:
          ("pull_request" in payload && payload.pull_request?.number) ||
          ("issue" in payload && payload.issue?.number) ||
          undefined,
        delivery: c.req.header("x-github-delivery"),
        ...(selfWebhook
          ? { ignored: "self-webhook" }
          : known
            ? {}
            : { ignored: "unknown event type" }),
      }),
    );

    // Skip self-webhooks and events we don't have a rule for
    if (selfWebhook || !known) return c.text("OK", 200);

    const eventType = rawEventType as EventType;
    const octokit = deps.createOctokit(c.env);

    // Handle bot commands on PR comments
    if (event === "issue_comment" && action === "created") {
      const commentPayload = payload as IssueCommentCreatedEvent;
      const commentBody = commentPayload.comment.body ?? "";
      const commandSlug = c.env.COMMAND_SLUG;
      if (commentPayload.issue.pull_request && isBotCommand(commentBody, commandSlug)) {
        await dispatchCommand(
          deps.commandConfig,
          {
            github: octokit,
            owner: commentPayload.repository.owner.login,
            repo: commentPayload.repository.name,
            issueNumber: commentPayload.issue.number,
            commentId: commentPayload.comment.id,
            commentBody,
            senderLogin: commentPayload.sender.login,
            botSlug: c.env.BOT_SLUG,
          },
          commandSlug,
        );
        return c.text("OK", 200);
      }
    }

    const context = new WebhookContext({
      github: octokit,
      payload,
      eventType,
      botSlug: c.env.BOT_SLUG,
      dryRun: isDryRun(c.env),
    });

    if (isPullRequestEvent(event) || isIssueEvent(event)) {
      await dispatch(deps.config, context);
    }

    return c.text("OK", 200);
  });

  return app;
}

export function createScheduledHandler(deps: BotDeps): (env: Env) => Promise<void> {
  return async (env) => {
    const octokit = deps.createOctokit(env);
    const since = new Date(Date.now() - CRON_LOOKBACK_MINUTES * 60 * 1000);
    const dryRun = isDryRun(env);

    const repos = Object.keys(deps.config.repositories);

    await Promise.allSettled(
      repos.map((repo) =>
        evaluateRecentPRs(deps.config, octokit, repo, since, { dryRun, botSlug: env.BOT_SLUG }),
      ),
    );
  };
}

const defaultDeps: BotDeps = {
  config,
  commandConfig,
  createOctokit: (env) => createOctokit(githubConfig(env)),
};

const app = createBotApp(defaultDeps);
const handleScheduled = createScheduledHandler(defaultDeps);

export default withSentry<Env>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    environment: env.ENVIRONMENT,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request, env, ctx) {
      return app.fetch(request, env, ctx);
    },
    async scheduled(_event, env, ctx) {
      ctx.waitUntil(handleScheduled(env));
    },
  } satisfies ExportedHandler<Env>,
);
