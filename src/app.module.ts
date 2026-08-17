import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { SentryModule } from "@sentry/nestjs/setup";
import { ClaModule } from "./cla/cla.module.js";
import { AppConfigModule } from "./config.module.js";
import { DiscordModule } from "./discord/discord.module.js";
import { GithubModule } from "./github/github.module.js";
import { HealthController } from "./health.controller.js";
import { UnhandledExceptionFilter } from "./unhandled-exception.filter.js";

@Module({
  imports: [SentryModule.forRoot(), AppConfigModule, GithubModule, ClaModule, DiscordModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: UnhandledExceptionFilter }],
})
export class AppModule {}
