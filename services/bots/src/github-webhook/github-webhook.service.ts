import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Octokit } from '@octokit/rest';
import { WEBHOOK_HANDLERS } from './github-webhook.const';

@Injectable()
export class GithubWebhookService {
  private githubApiClient: Octokit;

  constructor(configService: ConfigService) {
    this.githubApiClient = new Octokit({ auth: configService.get('github.token') });
  }

  async handleWebhook(eventType: string, payload: Record<string, any>): Promise<void> {
    await Promise.all(WEBHOOK_HANDLERS.map((handler) => handler.handle(eventType, payload)));
  }

  async test() {}
}
