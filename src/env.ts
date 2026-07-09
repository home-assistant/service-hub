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

  // Discord bot token. The gateway only starts when this is set —
  // absence means "no Discord", not a misconfiguration.
  DISCORD_TOKEN?: string;

  // Sentry
  SENTRY_DSN: string;

  // Environment
  ENVIRONMENT: string;

  // When "1", applyEffects logs effects instead of executing them.
  // Reads still happen so rules produce realistic effects.
  DRY_RUN?: string;
}

function required(name: keyof Env): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Build the runtime config from `process.env`, folding in a local `.env`
 * file when one exists (development); real environment variables win.
 */
export function loadEnv(): Env {
  try {
    process.loadEnvFile();
  } catch {
    // no .env file — production supplies real environment variables
  }
  return {
    GITHUB_APP_ID: required("GITHUB_APP_ID"),
    GITHUB_PRIVATE_KEY: required("GITHUB_PRIVATE_KEY"),
    GITHUB_INSTALLATION_ID: required("GITHUB_INSTALLATION_ID"),
    GITHUB_WEBHOOK_SECRET: required("GITHUB_WEBHOOK_SECRET"),
    BOT_SLUG: process.env.BOT_SLUG ?? "home-assistant",
    COMMAND_SLUG: process.env.COMMAND_SLUG ?? "ha-bot",
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    SENTRY_DSN: process.env.SENTRY_DSN ?? "",
    ENVIRONMENT: process.env.ENVIRONMENT ?? "production",
    DRY_RUN: process.env.DRY_RUN,
  };
}
