export interface Env {
  // GitHub App
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_WEBHOOK_SECRET: string;

  // Bot identity — must match the GitHub App's URL slug. `[bot]` is
  // added during runtime.
  BOT_SLUG: string;

  // Comment-command prefix — the bot reacts to comments starting with
  // `/${COMMAND_SLUG} <command>`.
  COMMAND_SLUG: string;

  // Sentry
  SENTRY_DSN: string;

  // Environment
  ENVIRONMENT: string;

  // When "1", applyEffects logs effects instead of executing them.
  // Reads still happen so rules produce realistic effects.
  DRY_RUN?: string;
}
