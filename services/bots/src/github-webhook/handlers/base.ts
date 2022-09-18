import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import { WEBHOOK_HANDLERS } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';

@Injectable()
export class BaseWebhookHandler {
  protected githubApiClient: Octokit;

  constructor(configService: ConfigService) {
    this.githubApiClient = new Octokit({ auth: configService.get('github.token') });
    WEBHOOK_HANDLERS.push(this);
  }

  async handle(context: WebhookContext) {}
}
