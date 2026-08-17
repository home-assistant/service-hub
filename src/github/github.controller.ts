import { Controller, HttpCode, Post, type RawBodyRequest, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { GithubWebhookGuard } from "./github-webhook.guard.js";
// biome-ignore lint/style/useImportType: DI paramtype — `import type` gets erased
import { WebhookService } from "./webhook.service.js";

@Controller("github")
export class GithubController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post("webhook")
  @HttpCode(200)
  @UseGuards(GithubWebhookGuard)
  webhook(@Req() request: RawBodyRequest<Request>): Promise<string> {
    const event = request.headers["x-github-event"];
    return this.webhookService.handle(
      request.rawBody?.toString() ?? "",
      typeof event === "string" ? event : "",
    );
  }
}
