import { Module } from "@nestjs/common";
import { AppConfigModule } from "../config.module.js";
import { GithubController } from "./github.controller.js";
import { OCTOKIT, octokitProvider } from "./octokit.provider.js";
import { WebhookService } from "./webhook.service.js";

@Module({
  imports: [AppConfigModule],
  controllers: [GithubController],
  providers: [octokitProvider, WebhookService],
  exports: [OCTOKIT],
})
export class GithubModule {}
