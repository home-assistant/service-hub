import * as Sentry from "@sentry/nestjs";
import { loadEnv } from "./env.js";
import { packageJson } from "./util/package-info.js";

// Imported for its side effect as the first import of main.ts, so Sentry
// instruments http/express before Nest loads. ConfigModule isn't up yet —
// loadEnv() reads process.env (+ local .env) directly, as the old
// server.ts did.
const env = loadEnv();

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.ENVIRONMENT,
  release: packageJson.version,
  // tracesSampleRate: 1.0,
  enableLogs: true,
});
