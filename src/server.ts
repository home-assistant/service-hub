import * as Sentry from "@sentry/node";
import { startDiscordGateway } from "./discord/engine/gateway.js";
import { discordRegistry } from "./discord/manifests/index.js";
import { loadEnv } from "./env.js";
import { createBotApp, createScheduledHandler, defaultDeps } from "./github/webhook.js";
import { log } from "./log.js";
import { serve } from "./util/serve.js";

// Cron lookback is 10 minutes; fire every 5 so consecutive runs overlap.
const CRON_INTERVAL_MS = 5 * 60 * 1000;

const env = loadEnv();

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.ENVIRONMENT,
  tracesSampleRate: 1.0,
  enableLogs: true,
});

const handleRequest = createBotApp(defaultDeps);
const handleScheduled = createScheduledHandler(defaultDeps);

const port = Number(process.env.PORT ?? 8787);

serve({
  port,
  fetch: (request) => handleRequest(request, env),
  error: (err) => {
    log.exception(err);
    return new Response("Internal Server Error", { status: 500 });
  },
});

log.info(`ha-github-bot listening on http://localhost:${port}`);

setInterval(() => {
  handleScheduled(env).catch((err) => log.exception(err));
}, CRON_INTERVAL_MS);

if (env.DISCORD_TOKEN) {
  startDiscordGateway(discordRegistry, {
    token: env.DISCORD_TOKEN,
    dryRun: env.DRY_RUN === "1",
  }).catch((err) => {
    log.exception(err instanceof Error ? err : new Error(String(err)));
  });
}
