import * as Sentry from "@sentry/bun";
import { loadEnv } from "./env.js";
import { createBotApp, createScheduledHandler, defaultDeps } from "./index.js";
import { log } from "./log.js";

// Cron lookback is 10 minutes; fire every 5 to keep the old overlap window
// the Cloudflare cron trigger ("*/5 * * * *") provided.
const CRON_INTERVAL_MS = 5 * 60 * 1000;

const env = loadEnv();

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.ENVIRONMENT,
  tracesSampleRate: 1.0,
  // Logs are shipped through src/log.ts (Sentry.logger with attributes).
  enableLogs: true,
});

const handleRequest = createBotApp(defaultDeps);
const handleScheduled = createScheduledHandler(defaultDeps);

const port = Number(process.env.PORT ?? 8787);

const server = Bun.serve({
  port,
  fetch: (request) => handleRequest(request, env),
  error: (err) => {
    log.exception(err);
    return new Response("Internal Server Error", { status: 500 });
  },
});

log.info(`ha-github-bot listening on http://localhost:${server.port}`);

setInterval(() => {
  handleScheduled(env).catch((err) => log.exception(err));
}, CRON_INTERVAL_MS);
