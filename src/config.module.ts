import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ENV, type Env, envSchema, loadEnv } from "./env.js";

/**
 * Env validation and the `ENV` provider. ConfigModule folds a local `.env`
 * into `process.env` (real environment variables win) and fail-fasts on an
 * invalid config at bootstrap; consumers inject the plain validated `Env`
 * object instead of ConfigService — the context builders and the WeakMap
 * memoizations (`cla/store.ts`, `org-membership.ts`) key on its identity,
 * which the singleton provider keeps stable.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
  ],
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class AppConfigModule {}
