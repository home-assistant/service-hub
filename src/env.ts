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

  // CLA storage and sign flow. The CLA check and the /cla-sign endpoints
  // only activate when the DynamoDB settings are set — absence means
  // "no CLA", not a misconfiguration.
  CLA_DDB_REGION?: string;
  CLA_SIGNERS_TABLE?: string;
  CLA_PENDING_SIGNERS_TABLE?: string;
  // OAuth app backing the sign form's GitHub login.
  CLA_SIGN_CLIENT_ID?: string;
  CLA_SIGN_CLIENT_SECRET?: string;

  // Sentry
  SENTRY_DSN: string;

  // Environment
  ENVIRONMENT: string;
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
    CLA_DDB_REGION: process.env.CLA_DDB_REGION,
    CLA_SIGNERS_TABLE: process.env.CLA_SIGNERS_TABLE,
    CLA_PENDING_SIGNERS_TABLE: process.env.CLA_PENDING_SIGNERS_TABLE,
    CLA_SIGN_CLIENT_ID: process.env.CLA_SIGN_CLIENT_ID,
    CLA_SIGN_CLIENT_SECRET: process.env.CLA_SIGN_CLIENT_SECRET,
    SENTRY_DSN: process.env.SENTRY_DSN ?? "",
    ENVIRONMENT: process.env.ENVIRONMENT ?? "production",
  };
}
