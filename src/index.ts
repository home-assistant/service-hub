import type { Octokit } from "@octokit/rest";
import { verify } from "@octokit/webhooks-methods";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { withSentry } from "@sentry/cloudflare";
import { Hono } from "hono";
import { dispatchCommand, isBotCommand } from "./commands/dispatch.js";
import type { CommandRegistryConfig } from "./commands/registry.js";
import { commandConfig } from "./commands/registry.js";
import { WebhookContext, type WebhookEventPayload } from "./context/webhook-context.js";
import type { Env } from "./env.js";
import { createOctokit, type GitHubAppConfig } from "./github/app.js";
import type { EventType } from "./github/types.js";
import type { RegistryConfig } from "./rules/dispatch.js";
import { dispatch } from "./rules/dispatch.js";
import { issueConfig } from "./rules-issue/registry.js";
import { prConfig } from "./rules-pr/registry.js";
import { evaluatePR, evaluateRecentPRs } from "./utils/evaluate.js";

const CRON_LOOKBACK_MINUTES = 10;

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
  return event === "pull_request" || event === "pull_request_review";
}

function isIssueEvent(event: string): boolean {
  return event === "issues";
}

export interface BotDeps {
  prConfig: RegistryConfig;
  issueConfig: RegistryConfig;
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
    const eventType = `${event}.${action}` as EventType;

    // Skip events without repository scope (installation, marketplace, etc.).
    // The `installation` event with action=new_permissions_accepted is the
    // canonical example; rules in this codebase all require a repository.
    if (!raw.repository || typeof raw.repository !== "object") {
      return c.text("OK", 200);
    }

    const payload = raw as unknown as WebhookEventPayload;

    console.log(
      JSON.stringify({
        webhook: eventType,
        repo: payload.repository.full_name,
        sender: payload.sender?.login,
        number:
          ("pull_request" in payload && payload.pull_request?.number) ||
          ("issue" in payload && payload.issue?.number) ||
          undefined,
        delivery: c.req.header("x-github-delivery"),
      }),
    );

    const octokit = deps.createOctokit(c.env);

    // Handle bot commands on PR comments
    if (event === "issue_comment" && action === "created") {
      const commentPayload = payload as IssueCommentCreatedEvent;
      const commentBody = commentPayload.comment.body ?? "";
      const slug = c.env.BOT_SLUG;
      if (commentPayload.issue.pull_request && isBotCommand(commentBody, slug)) {
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
            botSlug: slug,
          },
          slug,
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

    if (isPullRequestEvent(event)) {
      await dispatch(deps.prConfig, context);
    } else if (isIssueEvent(event)) {
      await dispatch(deps.issueConfig, context);
    }

    return c.text("OK", 200);
  });

  app.get("/replay", async (c) => {
    // Replay rules against recent PRs without mutating anything. Requires
    // DRY_RUN=1 so it cannot be invoked in production by accident.
    if (!isDryRun(c.env)) {
      return c.text("DRY_RUN=1 required", 403);
    }

    const repoFullName = c.req.query("repo") ?? "home-assistant/core";
    const count = Math.min(Number(c.req.query("count") ?? "20"), 100);
    const state = (c.req.query("state") ?? "all") as "open" | "closed" | "all";

    const [owner, repo] = repoFullName.split("/");
    if (!owner || !repo) return c.text("invalid repo", 400);

    const octokit = deps.createOctokit(c.env);

    const { data: prs } = await octokit.pulls.list({
      owner,
      repo,
      state,
      sort: "updated",
      direction: "desc",
      per_page: count,
    });

    const results: Array<Record<string, unknown>> = [];
    for (const pr of prs) {
      try {
        const effects = await evaluatePR(
          deps.prConfig,
          octokit,
          { owner, repo, pull_number: pr.number },
          { dryRun: true, botSlug: c.env.BOT_SLUG },
        );
        results.push({
          pr: pr.number,
          title: pr.title,
          state: pr.state,
          url: pr.html_url,
          effects,
        });
      } catch (err) {
        results.push({ pr: pr.number, title: pr.title, error: String(err) });
      }
    }

    return c.json({ repo: repoFullName, count: results.length, results });
  });

  return app;
}

export function createScheduledHandler(deps: BotDeps): (env: Env) => Promise<void> {
  return async (env) => {
    const octokit = deps.createOctokit(env);
    const since = new Date(Date.now() - CRON_LOOKBACK_MINUTES * 60 * 1000);
    const dryRun = isDryRun(env);

    const repos = Object.keys(deps.prConfig.repositories);

    await Promise.allSettled(
      repos.map((repo) =>
        evaluateRecentPRs(deps.prConfig, octokit, repo, since, { dryRun, botSlug: env.BOT_SLUG }),
      ),
    );
  };
}

const defaultDeps: BotDeps = {
  prConfig,
  issueConfig,
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
