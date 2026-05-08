import { verify } from "@octokit/webhooks-methods";
import { Hono } from "hono";
import { commandConfig, dispatchCommand } from "./commands/registry.js";
import { WebhookContext } from "./context/webhook-context.js";
import { createDatabase } from "./db/index.js";
import type { Env } from "./env.js";
import { createOctokit, type GitHubAppConfig } from "./github/app.js";
import type { EventType } from "./github/types.js";
import { evaluateRecentPRs } from "./refresh/evaluate.js";
import { config, dispatch } from "./rules/registry.js";
import { withSentry } from "./sentry.js";

const CRON_LOOKBACK_MINUTES = 10;

function githubConfig(env: Env): GitHubAppConfig {
  return {
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_PRIVATE_KEY,
    installationId: env.GITHUB_INSTALLATION_ID,
  };
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("OK"));

app.post("/github/webhook", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("x-hub-signature-256") ?? "";

  if (!(await verify(c.env.GITHUB_WEBHOOK_SECRET, body, signature))) {
    return c.text("Invalid signature", 401);
  }

  const payload = JSON.parse(body);
  const event = c.req.header("x-github-event") ?? "";
  const action = payload.action ?? "";
  const eventType = `${event}.${action}` as EventType;

  if (action === "new_permissions_accepted") {
    return c.text("OK", 200);
  }

  const octokit = createOctokit(githubConfig(c.env));
  const db = createDatabase(c.env.DB);

  // Handle bot commands on PR comments
  if (event === "issue_comment" && action === "created" && payload.issue?.pull_request) {
    const handled = await dispatchCommand(commandConfig, {
      github: octokit,
      db,
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issueNumber: payload.issue.number,
      commentId: payload.comment.id,
      commentBody: payload.comment?.body ?? "",
      senderLogin: payload.sender?.login ?? "",
    });
    if (handled) return c.text("OK", 200);
  }

  const context = new WebhookContext({ github: octokit, payload, eventType, db });
  await dispatch(config, context);

  return c.text("OK", 200);
});

async function handleScheduled(env: Env): Promise<void> {
  const octokit = createOctokit(githubConfig(env));
  const db = createDatabase(env.DB);
  const since = new Date(Date.now() - CRON_LOOKBACK_MINUTES * 60 * 1000);

  const repos = Object.keys(config.repositories);

  await Promise.allSettled(
    repos.map((repo) => evaluateRecentPRs(config, octokit, db, repo, since)),
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
