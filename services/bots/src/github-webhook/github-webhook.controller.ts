import { Body, Controller, Post, UseGuards, Headers } from '@nestjs/common';
import { GithubWebhookService } from './github-webhook.service';

import { GithubGuard, GithubWebhookEvents } from '@dev-thought/nestjs-github-webhooks';

@Controller('/github-webhook')
@UseGuards(GithubGuard)
export class GithubWebhookController {
  constructor(private readonly GithubWebhookService: GithubWebhookService) {}

  @Post()
  @GithubWebhookEvents([])
  async webhook(
    @Headers() headers: Record<string, any>,
    @Body() payload: Record<string, any>,
  ): Promise<void> {
    await this.GithubWebhookService.handleWebhook({
      eventType: `${headers['x-github-event']}.${payload.action}`,
      deliveryId: headers['x-github-delivery'],
      payload,
    });
  }
}
