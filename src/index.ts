import { verify } from "@octokit/webhooks-methods";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { withSentry } from "@sentry/cloudflare";
import { Hono } from "hono";
import { commandConfig, dispatchCommand } from "./commands/registry.js";
import { WebhookContext, type WebhookEventPayload } from "./context/webhook-context.js";
import { createDatabase } from "./db/index.js";
import type { Env } from "./env.js";
import { createOctokit, type GitHubAppConfig } from "./github/app.js";
import type { EventType } from "./github/types.js";
import { dispatch } from "./rules/dispatch.js";
import { issueConfig } from "./rules-issue/registry.js";
import { prConfig } from "./rules-pr/registry.js";
import { evaluateRecentPRs } from "./utils/evaluate.js";

const CRON_LOOKBACK_MINUTES = 10;

function githubConfig(env: Env): GitHubAppConfig {
  return {
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_PRIVATE_KEY,
    installationId: env.GITHUB_INSTALLATION_ID,
  };
}

function isPullRequestEvent(event: string): boolean {
  return event === "pull_request" || event === "pull_request_review";
}

function isIssueEvent(event: string): boolean {
  return event === "issues";
}

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
  const eventType = `${event}.${action}` as EventType;

  if (action === "new_permissions_accepted") {
    return c.text("OK", 200);
  }

  const payload = raw as unknown as WebhookEventPayload;

  const octokit = createOctokit(githubConfig(c.env));
  const db = createDatabase(c.env.DB);

  // Handle bot commands on PR comments
  if (event === "issue_comment" && action === "created") {
    const commentPayload = payload as IssueCommentCreatedEvent;
    if (commentPayload.issue.pull_request) {
      const handled = await dispatchCommand(commandConfig, {
        github: octokit,
        db,
        owner: commentPayload.repository.owner.login,
        repo: commentPayload.repository.name,
        issueNumber: commentPayload.issue.number,
        commentId: commentPayload.comment.id,
        commentBody: commentPayload.comment.body ?? "",
        senderLogin: commentPayload.sender.login,
      });
      if (handled) return c.text("OK", 200);
    }
  }

  const context = new WebhookContext({ github: octokit, payload, eventType, db });

  if (isPullRequestEvent(event)) {
    await dispatch(prConfig, context);
  } else if (isIssueEvent(event)) {
    await dispatch(issueConfig, context);
  }

  return c.text("OK", 200);
});

async function handleScheduled(env: Env): Promise<void> {
  const octokit = createOctokit(githubConfig(env));
  const db = createDatabase(env.DB);
  const since = new Date(Date.now() - CRON_LOOKBACK_MINUTES * 60 * 1000);

  const repos = Object.keys(prConfig.repositories);

  await Promise.allSettled(
    repos.map((repo) => evaluateRecentPRs(prConfig, octokit, db, repo, since)),
  );
}

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
