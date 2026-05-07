export interface Env {
  // GitHub App
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_WEBHOOK_SECRET: string;

  // Bot
  BOT_LOGIN: string; // e.g. "ha-bot[bot]"

  // Cloudflare D1
  DB: D1Database;

  // Sentry
  SENTRY_DSN: string;

  // Environment
  ENVIRONMENT: string;
}
