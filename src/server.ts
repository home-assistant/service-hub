import * as Sentry from "@sentry/bun";
import { loadEnv } from "./env.js";
import { createBotApp, createScheduledHandler, defaultDeps } from "./index.js";

// Cron lookback is 10 minutes; fire every 5 to keep the old overlap window
// the Cloudflare cron trigger ("*/5 * * * *") provided.
const CRON_INTERVAL_MS = 5 * 60 * 1000;

const env = loadEnv();

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.ENVIRONMENT,
  tracesSampleRate: 1.0,
});

const deps = { ...defaultDeps, captureException: (err: unknown) => Sentry.captureException(err) };

const handleRequest = createBotApp(deps);
const handleScheduled = createScheduledHandler(deps);

const port = Number(process.env.PORT ?? 8787);

const server = Bun.serve({
  port,
  fetch: (request) => handleRequest(request, env),
  error: (err) => {
    Sentry.captureException(err);
    return new Response("Internal Server Error", { status: 500 });
  },
});

console.log(`ha-github-bot listening on http://localhost:${server.port}`);

setInterval(() => {
  handleScheduled(env).catch((err) => Sentry.captureException(err));
}, CRON_INTERVAL_MS);
