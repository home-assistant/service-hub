import { z } from "zod";

export const envSchema = z.object({
  // GitHub App
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_PRIVATE_KEY: z.string().min(1),
  GITHUB_INSTALLATION_ID: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),

  // Bot identity — must match the GitHub App's URL slug. `[bot]` is
  // added during runtime.
  BOT_SLUG: z.string().default("home-assistant"),

  // Comment-command prefix — the bot reacts to comments starting with
  // `/${COMMAND_SLUG} <command>`.
  COMMAND_SLUG: z.string().default("ha-bot"),

  // Discord bot token. The gateway only starts when this is set —
  // absence means "no Discord", not a misconfiguration.
  DISCORD_TOKEN: z.string().optional(),

  // CLA storage and sign flow. The CLA check and the /cla-sign endpoints
  // only activate when the DynamoDB settings are set — absence means
  // "no CLA", not a misconfiguration.
  CLA_DDB_REGION: z.string().optional(),
  CLA_SIGNERS_TABLE: z.string().optional(),
  CLA_PENDING_SIGNERS_TABLE: z.string().optional(),
  // OAuth app backing the sign form's GitHub login.
  CLA_SIGN_CLIENT_ID: z.string().optional(),
  CLA_SIGN_CLIENT_SECRET: z.string().optional(),

  // Sentry
  SENTRY_DSN: z.string().default(""),

  // Environment
  ENVIRONMENT: z.string().default("production"),

  // HTTP listen port
  PORT: z.coerce.number().default(8787),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Injection token for the validated `Env` object. Lives here (not in
 * config.module.ts) so importing it never evaluates `ConfigModule.forRoot`,
 * which validates process.env at module-evaluation time.
 */
export const ENV = Symbol("ENV");

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
  return envSchema.parse(process.env);
}
