import { serve } from "@hono/node-server";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import * as Sentry from "@sentry/node";
import { startDiscordGateway } from "./discord/engine/gateway.js";
import { discordRegistry } from "./discord/manifests/index.js";
import { loadEnv } from "./env.js";
import { ghWebhookHandler } from "./github/app.js";
import { trackGithubQuota } from "./github/quota-metrics.js";
import { log } from "./log.js";

const env = loadEnv();

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.ENVIRONMENT,
  // tracesSampleRate: 1.0,
  enableLogs: true,
});

const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: Number(env.GITHUB_APP_ID),
    installationId: Number(env.GITHUB_INSTALLATION_ID),
    privateKey: env.GITHUB_PRIVATE_KEY,
  },
});

trackGithubQuota(octokit);

function routes(request: Request): Response | Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/github/webhook") {
    return ghWebhookHandler(env, octokit, request);
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return new Response("OK");
  }

  return new Response("Not Found", { status: 404 });
}

/** Exported so tests can boot the real server on a random port. */
export const server = serve({
  port: Number(process.env.PORT ?? 8787),
  fetch: async (request) => {
    try {
      return await routes(request);
    } catch (err) {
      log.exception(err);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});

if (env.DISCORD_TOKEN) {
  startDiscordGateway(discordRegistry, {
    token: env.DISCORD_TOKEN,
  }).catch((err) => {
    log.exception(err instanceof Error ? err : new Error(String(err)));
  });
}

log.info(`bot finished setup`);
