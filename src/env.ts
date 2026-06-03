export interface Env {
  // GitHub App
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_WEBHOOK_SECRET: string;

  // Bot
  BOT_LOGIN: string; // e.g. "ha-bot[bot]"

  // Sentry
  SENTRY_DSN: string;

  // Environment
  ENVIRONMENT: string;

  // When "1", applyEffects logs effects instead of executing them.
  // Reads (GitHub/DB) still happen so rules produce realistic effects.
  DRY_RUN?: string;
}
