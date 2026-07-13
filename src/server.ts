import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import * as Sentry from "@sentry/node";
import { startDiscordGateway } from "./discord/engine/gateway.js";
import { discordRegistry } from "./discord/manifests/index.js";
import { loadEnv } from "./env.js";
import { requestHandler, scheduledHandler } from "./github/app.js";
import { log } from "./log.js";
import { serve } from "./util/serve.js";

const CRON_INTERVAL_MIN = 5;

const env = loadEnv();

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.ENVIRONMENT,
  tracesSampleRate: 1.0,
  enableLogs: true,
});

// One shared instance: @octokit/auth-app caches the hourly installation
// token inside it, so per-call instances would re-authenticate every time.
const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: Number(env.GITHUB_APP_ID),
    installationId: Number(env.GITHUB_INSTALLATION_ID),
    privateKey: env.GITHUB_PRIVATE_KEY,
  },
});

const port = Number(process.env.PORT ?? 8787);

serve({
  port,
  fetch: (request) => requestHandler(env, octokit, request),
  error: (err) => {
    log.exception(err);
    return new Response("Internal Server Error", { status: 500 });
  },
});

log.info(`ha-github-bot listening on http://localhost:${port}`);

setInterval(
  () => {
    scheduledHandler(env, octokit, CRON_INTERVAL_MIN).catch((err) => log.exception(err));
  },
  CRON_INTERVAL_MIN * 60 * 1000,
);

if (env.DISCORD_TOKEN) {
  startDiscordGateway(discordRegistry, {
    token: env.DISCORD_TOKEN,
    dryRun: env.DRY_RUN === "1",
  }).catch((err) => {
    log.exception(err instanceof Error ? err : new Error(String(err)));
  });
}
