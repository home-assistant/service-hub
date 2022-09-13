import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Octokit } from '@octokit/rest';
import { WebhookHandlerParams, WEBHOOK_HANDLERS } from './github-webhook.const';

@Injectable()
export class GithubWebhookService {
  private githubApiClient: Octokit;

  constructor(configService: ConfigService) {
    this.githubApiClient = new Octokit({ auth: configService.get('github.token') });
  }

  async handleWebhook(params: WebhookHandlerParams): Promise<void> {
    await Promise.all(WEBHOOK_HANDLERS.map((handler) => handler.handle(params)));
  }

  async test() {}
}
