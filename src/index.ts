import { Hono } from "hono";
import { WebhookContext } from "./context/webhook-context.js";
import { createDatabase } from "./db/index.js";
import type { Env } from "./env.js";
import { createOctokit, type GitHubAppConfig } from "./github/app.js";
import type { EventType } from "./github/types.js";
import { verifyWebhookSignature } from "./github/webhook.js";
import { config, dispatch } from "./handlers/registry.js";
import { evaluatePR, evaluateRecentPRs } from "./refresh/evaluate.js";
import { withSentry } from "./sentry.js";

const BOT_COMMAND_PATTERN = /^@ha-bot\s+update\s*$/im;
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

  if (!(await verifyWebhookSignature(c.env.GITHUB_WEBHOOK_SECRET, body, signature))) {
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

  // Handle @ha-bot update command
  if (event === "issue_comment" && action === "created" && payload.issue?.pull_request) {
    const commentBody: string = payload.comment?.body ?? "";
    if (BOT_COMMAND_PATTERN.test(commentBody)) {
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const prNumber = payload.issue.number;

      await evaluatePR(config, octokit, db, { owner, repo, number: prNumber });

      // React with thumbs-up to acknowledge the command
      await octokit.reactions.createForIssueComment({
        owner,
        repo,
        comment_id: payload.comment.id,
        content: "+1",
      });

      return c.text("OK", 200);
    }
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
